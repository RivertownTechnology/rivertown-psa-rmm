import { eq, and, ne, inArray } from 'drizzle-orm';
import {
  complianceFrameworks,
  compliancePolicyAreas,
  complianceControls,
  complianceCustomerScopes,
  complianceControlStatuses,
  complianceAssessmentItems,
  compliancePoamItems,
  complianceRiskItems,
  complianceEvidenceControls,
  complianceControlAssets,
  complianceControlTickets,
  complianceActivityLog,
} from '@rivertown/db';
import type { FrameworkData } from './frameworks/index.js';

export interface SyncResult {
  frameworkId: string;
  shortName: string;
  inserted: number;
  updated: number;
  deleted: number;
  deprecated: number;
}

/**
 * Idempotently sync a built-in framework definition into a tenant.
 * - Upserts the framework by shortName, policy areas by code, controls by controlCode.
 * - Updates existing controls IN PLACE (same UUID) so assessment items, statuses,
 *   POA&M entries, and evidence links survive content updates.
 * - Backfills not_assessed control statuses for newly added controls across active scopes.
 * - Controls removed from the definition are hard-deleted when nothing references them,
 *   otherwise flagged metadata.deprecated so history is preserved but new work excludes them.
 */
export async function syncFramework(
  db: any,
  tenantId: string,
  data: FrameworkData,
  actorId?: string,
): Promise<SyncResult> {
  return db.transaction(async (tx: any) => {
    // ── Framework upsert (by shortName) ────────────────────────────
    const [existingFw] = await tx.select().from(complianceFrameworks)
      .where(and(
        eq(complianceFrameworks.tenantId, tenantId),
        eq(complianceFrameworks.shortName, data.shortName),
      )).limit(1);

    const fwValues = {
      name: data.name,
      version: data.version,
      description: data.description,
      source: 'built_in',
      isActive: true,
      nistMappingEnabled: data.nistMappingEnabled,
      metadata: { ...data.metadata, contentVersion: String(data.contentVersion) },
      updatedAt: new Date(),
    };

    let frameworkId: string;
    if (existingFw) {
      frameworkId = existingFw.id;
      await tx.update(complianceFrameworks).set(fwValues)
        .where(eq(complianceFrameworks.id, frameworkId));
    } else {
      const [fw] = await tx.insert(complianceFrameworks).values({
        tenantId, shortName: data.shortName, ...fwValues,
      }).returning();
      frameworkId = fw.id;
    }

    // ── Policy area upsert (by code) ───────────────────────────────
    const existingAreas = await tx.select().from(compliancePolicyAreas)
      .where(eq(compliancePolicyAreas.frameworkId, frameworkId));
    const areaByCode = new Map<string, any>(existingAreas.map((a: any) => [a.code, a]));
    const areaIdByCode = new Map<string, string>();

    for (let i = 0; i < data.areas.length; i++) {
      const areaDef = data.areas[i];
      const existing = areaByCode.get(areaDef.code);
      if (existing) {
        await tx.update(compliancePolicyAreas).set({
          title: areaDef.title,
          description: areaDef.description ?? null,
          sortOrder: i,
          updatedAt: new Date(),
        }).where(eq(compliancePolicyAreas.id, existing.id));
        areaIdByCode.set(areaDef.code, existing.id);
      } else {
        const [pa] = await tx.insert(compliancePolicyAreas).values({
          tenantId, frameworkId,
          code: areaDef.code, title: areaDef.title,
          description: areaDef.description ?? null, sortOrder: i,
        }).returning();
        areaIdByCode.set(areaDef.code, pa.id);
      }
    }

    // ── Control upsert (by controlCode) ────────────────────────────
    const existingControls = await tx.select().from(complianceControls)
      .where(eq(complianceControls.frameworkId, frameworkId));
    const controlByCode = new Map<string, any>(existingControls.map((c: any) => [c.controlCode, c]));

    let inserted = 0, updated = 0, deleted = 0, deprecated = 0;
    const newControlIds: string[] = [];
    const definedCodes = new Set<string>();

    for (const areaDef of data.areas) {
      const policyAreaId = areaIdByCode.get(areaDef.code)!;
      for (let j = 0; j < areaDef.controls.length; j++) {
        const c = areaDef.controls[j];
        definedCodes.add(c.code);
        const values = {
          policyAreaId,
          title: c.title,
          description: c.description,
          guidance: c.explanation ?? null,
          example: c.example ?? null,
          nistMapping: c.nist ?? null,
          severity: c.severity || 'medium',
          controlType: c.type,
          assessmentMethod: c.type === 'technical' ? 'test' : 'examine',
          automationSource: c.auto ?? null,
          automationCheck: c.autoCheck ?? null,
          sortOrder: j,
        };
        const existing = controlByCode.get(c.code);
        if (existing) {
          const metadata = { ...(existing.metadata || {}) };
          delete (metadata as any).deprecated;
          await tx.update(complianceControls).set({ ...values, metadata, updatedAt: new Date() })
            .where(eq(complianceControls.id, existing.id));
          updated++;
        } else {
          const [row] = await tx.insert(complianceControls).values({
            tenantId, frameworkId, controlCode: c.code, ...values,
          }).returning();
          newControlIds.push(row.id);
          inserted++;
        }
      }
    }

    // ── Backfill statuses for new controls across active scopes ────
    if (newControlIds.length > 0) {
      const scopes = await tx.select().from(complianceCustomerScopes)
        .where(and(
          eq(complianceCustomerScopes.frameworkId, frameworkId),
          eq(complianceCustomerScopes.status, 'active'),
        ));
      for (const scope of scopes) {
        await tx.insert(complianceControlStatuses).values(
          newControlIds.map((controlId) => ({
            tenantId, customerId: scope.customerId, frameworkId, controlId,
            status: 'not_assessed',
          })),
        ).onConflictDoNothing();
      }
    }

    // ── Removed controls: delete if unreferenced, else deprecate ───
    const orphans = existingControls.filter((c: any) => !definedCodes.has(c.controlCode));
    for (const orphan of orphans) {
      const referenced = await isControlReferenced(tx, orphan.id);
      if (referenced) {
        const metadata = { ...(orphan.metadata || {}), deprecated: true };
        await tx.update(complianceControls).set({ metadata, updatedAt: new Date() })
          .where(eq(complianceControls.id, orphan.id));
        deprecated++;
      } else {
        await tx.delete(complianceControlStatuses)
          .where(eq(complianceControlStatuses.controlId, orphan.id));
        await tx.delete(complianceControls).where(eq(complianceControls.id, orphan.id));
        deleted++;
      }
    }

    // ── Remove policy areas left with no controls ──────────────────
    const remainingControls = await tx.select({ policyAreaId: complianceControls.policyAreaId })
      .from(complianceControls).where(eq(complianceControls.frameworkId, frameworkId));
    const usedAreaIds = new Set(remainingControls.map((c: any) => c.policyAreaId));
    const allAreas = await tx.select().from(compliancePolicyAreas)
      .where(eq(compliancePolicyAreas.frameworkId, frameworkId));
    const emptyAreaIds = allAreas.filter((a: any) => !usedAreaIds.has(a.id)).map((a: any) => a.id);
    if (emptyAreaIds.length > 0) {
      await tx.delete(compliancePolicyAreas).where(inArray(compliancePolicyAreas.id, emptyAreaIds));
    }

    await tx.insert(complianceActivityLog).values({
      tenantId,
      entityType: 'framework',
      entityId: frameworkId,
      action: 'updated',
      actorType: actorId ? 'user' : 'system',
      actorId: actorId || frameworkId,
      description: `Synced ${data.shortName} v${data.version} (content v${data.contentVersion}): +${inserted} added, ~${updated} updated, -${deleted} removed, ${deprecated} deprecated`,
    });

    return { frameworkId, shortName: data.shortName, inserted, updated, deleted, deprecated };
  });
}

/** A control is referenced when history or links would be lost by deleting it. */
async function isControlReferenced(tx: any, controlId: string): Promise<boolean> {
  const [item] = await tx.select({ id: complianceAssessmentItems.id })
    .from(complianceAssessmentItems)
    .where(eq(complianceAssessmentItems.controlId, controlId)).limit(1);
  if (item) return true;

  const [poam] = await tx.select({ id: compliancePoamItems.id })
    .from(compliancePoamItems)
    .where(eq(compliancePoamItems.controlId, controlId)).limit(1);
  if (poam) return true;

  const [risk] = await tx.select({ id: complianceRiskItems.id })
    .from(complianceRiskItems)
    .where(eq(complianceRiskItems.controlId, controlId)).limit(1);
  if (risk) return true;

  const [assessedStatus] = await tx.select({ id: complianceControlStatuses.id })
    .from(complianceControlStatuses)
    .where(and(
      eq(complianceControlStatuses.controlId, controlId),
      ne(complianceControlStatuses.status, 'not_assessed'),
    )).limit(1);
  if (assessedStatus) return true;

  // Evidence, asset, or ticket links hang off control statuses
  const statuses = await tx.select({ id: complianceControlStatuses.id })
    .from(complianceControlStatuses)
    .where(eq(complianceControlStatuses.controlId, controlId));
  const statusIds = statuses.map((s: any) => s.id);
  if (statusIds.length > 0) {
    const [ev] = await tx.select({ id: complianceEvidenceControls.id })
      .from(complianceEvidenceControls)
      .where(inArray(complianceEvidenceControls.controlStatusId, statusIds)).limit(1);
    if (ev) return true;
    const [asset] = await tx.select({ id: complianceControlAssets.id })
      .from(complianceControlAssets)
      .where(inArray(complianceControlAssets.controlStatusId, statusIds)).limit(1);
    if (asset) return true;
    const [ticket] = await tx.select({ id: complianceControlTickets.id })
      .from(complianceControlTickets)
      .where(inArray(complianceControlTickets.controlStatusId, statusIds)).limit(1);
    if (ticket) return true;
  }
  return false;
}
