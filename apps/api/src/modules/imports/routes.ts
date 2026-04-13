/**
 * Data import endpoints. Plan-gated to Pro+ via the `data_import` entitlement.
 * Currently supports ConnectWise Companies — more entity types to follow.
 */
import { FastifyInstance } from 'fastify';
import { eq, and, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  customers, importJobs, tenantCustomFieldDefs, tenantLookupValues,
} from '@rivertown/db';
import { requireFeature } from '../../auth/entitlements.js';
import { requirePermission } from '../../auth/rbac.js';
import { logAudit } from '../../common/audit.js';
import { parseImportFile } from './parsers.js';
import {
  prepareCompanyRows, DEFAULT_COMPANY_MAPPING, COMPANY_TARGET_FIELDS,
  type ColumnMapping,
} from './connectwise-companies.js';

const UPLOAD_LIMIT_BYTES = 10 * 1024 * 1024; // 10 MB

export async function importsRoutes(fastify: FastifyInstance) {
  // ===== GET /api/v1/imports/connectwise/companies/template =====
  // Returns the default column mapping + expected headers — frontend shows this
  // before the user uploads so they know what to export from ConnectWise.
  fastify.get(
    '/api/v1/imports/connectwise/companies/template',
    {
      preHandler: [
        fastify.authenticate,
        requirePermission('*'),
        requireFeature(fastify, 'data_import'),
      ],
    },
    async () => {
      return {
        entity: 'customer',
        source: 'connectwise',
        defaultMapping: DEFAULT_COMPANY_MAPPING,
        targetFields: COMPANY_TARGET_FIELDS,
        expectedHeaders: Object.keys(DEFAULT_COMPANY_MAPPING),
      };
    },
  );

  // ===== POST /api/v1/imports/connectwise/companies/preview =====
  // Accepts the uploaded file + mapping, returns parsed rows + validation errors.
  // Does NOT write to the database.
  fastify.post(
    '/api/v1/imports/connectwise/companies/preview',
    {
      preHandler: [
        fastify.authenticate,
        requirePermission('*'),
        requireFeature(fastify, 'data_import'),
      ],
    },
    async (request, reply) => {
      const file = await (request as any).file?.();
      if (!file) { reply.code(400); return { error: 'NO_FILE', message: 'Upload a file.' }; }

      const chunks: Buffer[] = [];
      let total = 0;
      for await (const chunk of file.file) {
        total += chunk.length;
        if (total > UPLOAD_LIMIT_BYTES) {
          reply.code(413);
          return { error: 'FILE_TOO_LARGE', message: `Max ${UPLOAD_LIMIT_BYTES / (1024 * 1024)}MB.` };
        }
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);
      const filename = file.filename as string;

      // Mapping may be sent as a JSON-encoded field alongside the file
      let mapping: ColumnMapping = DEFAULT_COMPANY_MAPPING;
      const mappingField = file.fields?.mapping;
      if (mappingField && typeof mappingField.value === 'string') {
        try {
          mapping = JSON.parse(mappingField.value);
        } catch {
          reply.code(400);
          return { error: 'INVALID_MAPPING', message: 'mapping field must be valid JSON.' };
        }
      }

      let parsed;
      try {
        parsed = parseImportFile(buffer, filename);
      } catch (err) {
        reply.code(400);
        return { error: 'PARSE_FAILED', message: err instanceof Error ? err.message : 'Could not parse file.' };
      }

      const { rows, errors } = prepareCompanyRows(parsed, mapping);

      // Return up to first 100 preview rows to keep response small
      const previewRows = rows.slice(0, 100);

      return {
        filename,
        headers: parsed.headers,
        totalRows: parsed.totalRows,
        readyRows: rows.length,
        errorCount: errors.length,
        errors: errors.slice(0, 100), // cap
        preview: previewRows,
      };
    },
  );

  // ===== POST /api/v1/imports/connectwise/companies/execute =====
  // Actually writes to the DB. Upserts by (tenant_id, external_source, external_id)
  // when external_id is present, else inserts fresh customers.
  fastify.post(
    '/api/v1/imports/connectwise/companies/execute',
    {
      preHandler: [
        fastify.authenticate,
        requirePermission('*'),
        requireFeature(fastify, 'data_import'),
      ],
    },
    async (request, reply) => {
      const file = await (request as any).file?.();
      if (!file) { reply.code(400); return { error: 'NO_FILE' }; }

      const chunks: Buffer[] = [];
      let total = 0;
      for await (const chunk of file.file) {
        total += chunk.length;
        if (total > UPLOAD_LIMIT_BYTES) {
          reply.code(413);
          return { error: 'FILE_TOO_LARGE' };
        }
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);
      const filename = file.filename as string;

      let mapping: ColumnMapping = DEFAULT_COMPANY_MAPPING;
      const mappingField = file.fields?.mapping;
      if (mappingField && typeof mappingField.value === 'string') {
        try { mapping = JSON.parse(mappingField.value); }
        catch { reply.code(400); return { error: 'INVALID_MAPPING' }; }
      }

      let parsed;
      try { parsed = parseImportFile(buffer, filename); }
      catch (err) {
        reply.code(400);
        return { error: 'PARSE_FAILED', message: err instanceof Error ? err.message : 'Parse failed' };
      }

      const { rows, errors } = prepareCompanyRows(parsed, mapping);

      // Create a job row first so the audit trail captures even partial imports
      const [job] = await fastify.db
        .insert(importJobs)
        .values({
          tenantId: request.tenantId,
          userId: request.user.sub,
          source: 'connectwise',
          entityType: 'customer',
          status: 'processing',
          totalRows: parsed.totalRows,
        })
        .returning({ id: importJobs.id });

      let imported = 0;
      let updated = 0;
      const runtimeErrors: { row: number; message: string }[] = [...errors];

      // Collect discovered lookup values — customer_type, status, and every custom field
      // gets a counted distinct-value tally for dropdown UIs later.
      const lookupCounts = new Map<string, number>(); // key = 'entity:field:value' -> count
      const bump = (field: string, raw: unknown) => {
        const value = String(raw ?? '').trim();
        if (!value) return;
        const key = `customer::${field}::${value}`;
        lookupCounts.set(key, (lookupCounts.get(key) ?? 0) + 1);
      };

      // Auto-register any custom fields we see on the fly (per-tenant)
      const customFieldKeys = new Set<string>();
      for (const r of rows) {
        for (const k of Object.keys(r.customer.customFields)) customFieldKeys.add(k);
      }
      if (customFieldKeys.size > 0) {
        const existing = await fastify.db
          .select({ fieldKey: tenantCustomFieldDefs.fieldKey })
          .from(tenantCustomFieldDefs)
          .where(and(
            eq(tenantCustomFieldDefs.tenantId, request.tenantId),
            eq(tenantCustomFieldDefs.entityType, 'customer'),
          ));
        const existingSet = new Set(existing.map((e) => e.fieldKey));
        const toCreate = [...customFieldKeys].filter((k) => !existingSet.has(k));
        if (toCreate.length > 0) {
          await fastify.db.insert(tenantCustomFieldDefs).values(
            toCreate.map((fieldKey, i) => ({
              tenantId: request.tenantId,
              entityType: 'customer',
              fieldKey,
              label: fieldKey.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
              fieldType: 'text',
              displayOrder: 100 + i,
            })),
          );
        }
      }

      for (const r of rows) {
        // Record lookup values for dropdown discovery
        bump('status', r.customer.status);
        bump('customer_type', r.customer.customerType);
        for (const [k, v] of Object.entries(r.customer.customFields)) bump(k, v);

        try {
          const values = {
            tenantId: request.tenantId,
            name: r.customer.name,
            status: r.customer.status,
            customerType: r.customer.customerType,
            phone: r.customer.phone,
            address: r.customer.address,
            city: r.customer.city,
            state: r.customer.state,
            zip: r.customer.zip,
            county: r.customer.county,
            website: r.customer.website,
            billingEmail: r.customer.billingEmail,
            ccBillingEmail: r.customer.ccBillingEmail,
            externalId: r.customer.externalId,
            externalSource: 'connectwise' as const,
            externalNumber: r.customer.externalNumber,
            customFields: r.customer.customFields,
            updatedAt: new Date(),
          };

          if (r.customer.externalId) {
            // Upsert based on the (tenant_id, external_source, external_id) unique index
            const result = await fastify.db
              .insert(customers)
              .values(values)
              .onConflictDoUpdate({
                target: [customers.tenantId, customers.externalSource, customers.externalId],
                set: {
                  name: values.name,
                  status: values.status,
                  customerType: values.customerType,
                  phone: values.phone,
                  address: values.address,
                  city: values.city,
                  state: values.state,
                  zip: values.zip,
                  county: values.county,
                  website: values.website,
                  externalNumber: values.externalNumber,
                  customFields: sql`${customers.customFields} || ${values.customFields}::jsonb`,
                  updatedAt: new Date(),
                },
              })
              .returning({ id: customers.id, createdAt: customers.createdAt, updatedAt: customers.updatedAt });
            const row = result[0];
            // Rough heuristic: if createdAt is within 2 seconds of updatedAt, it's a new insert
            if (row && Math.abs(row.createdAt.getTime() - row.updatedAt.getTime()) < 2000) {
              imported++;
            } else {
              updated++;
            }
          } else {
            await fastify.db.insert(customers).values(values);
            imported++;
          }
        } catch (err) {
          runtimeErrors.push({
            row: r.rowNumber,
            message: err instanceof Error ? err.message.slice(0, 200) : 'Database error',
          });
        }
      }

      // Upsert discovered lookup values so the UI can offer them as dropdowns later.
      // Upsert increments usage_count and bumps last_seen_at.
      if (lookupCounts.size > 0) {
        const now = new Date();
        const values = Array.from(lookupCounts.entries()).map(([key, count]) => {
          const [, field, value] = key.split('::');
          return {
            tenantId: request.tenantId,
            entityType: 'customer',
            field: field!,
            value: value!,
            usageCount: count,
            source: 'connectwise',
            firstSeenAt: now,
            lastSeenAt: now,
          };
        });
        // Chunk to keep each insert statement under driver limits
        const CHUNK = 500;
        for (let i = 0; i < values.length; i += CHUNK) {
          const slice = values.slice(i, i + CHUNK);
          await fastify.db
            .insert(tenantLookupValues)
            .values(slice)
            .onConflictDoUpdate({
              target: [tenantLookupValues.tenantId, tenantLookupValues.entityType, tenantLookupValues.field, tenantLookupValues.value],
              set: {
                usageCount: sql`${tenantLookupValues.usageCount} + excluded.usage_count`,
                lastSeenAt: now,
              },
            });
        }
      }

      await fastify.db
        .update(importJobs)
        .set({
          status: runtimeErrors.length === rows.length ? 'failed' : 'completed',
          importedRows: imported,
          updatedRows: updated,
          failedRows: runtimeErrors.length,
          errors: runtimeErrors.slice(0, 500),
          completedAt: new Date(),
        })
        .where(eq(importJobs.id, job.id));

      await logAudit(fastify.db, {
        tenantId: request.tenantId,
        actorType: 'user',
        actorId: request.user.sub,
        action: 'import.connectwise.companies',
        entityType: 'import_job',
        entityId: job.id,
        changes: {
          totalRows: { old: null, new: parsed.totalRows },
          importedRows: { old: null, new: imported },
          updatedRows: { old: null, new: updated },
          failedRows: { old: null, new: runtimeErrors.length },
        },
      });

      return {
        jobId: job.id,
        totalRows: parsed.totalRows,
        importedRows: imported,
        updatedRows: updated,
        failedRows: runtimeErrors.length,
        errors: runtimeErrors.slice(0, 100),
      };
    },
  );

  // ===== GET /api/v1/imports/history =====
  fastify.get(
    '/api/v1/imports/history',
    {
      preHandler: [
        fastify.authenticate,
        requirePermission('*'),
        requireFeature(fastify, 'data_import'),
      ],
    },
    async (request) => {
      const rows = await fastify.db
        .select()
        .from(importJobs)
        .where(eq(importJobs.tenantId, request.tenantId))
        .orderBy(sql`${importJobs.startedAt} DESC`)
        .limit(50);
      return rows;
    },
  );

  // ===== Custom field definitions (CRUD) =====
  fastify.get(
    '/api/v1/custom-fields/:entity',
    { preHandler: [fastify.authenticate, requirePermission('*')] },
    async (request) => {
      const { entity } = request.params as { entity: string };
      return fastify.db
        .select()
        .from(tenantCustomFieldDefs)
        .where(and(
          eq(tenantCustomFieldDefs.tenantId, request.tenantId),
          eq(tenantCustomFieldDefs.entityType, entity),
        ))
        .orderBy(tenantCustomFieldDefs.displayOrder);
    },
  );

  fastify.post(
    '/api/v1/custom-fields/:entity',
    { preHandler: [fastify.authenticate, requirePermission('*')] },
    async (request, reply) => {
      const { entity } = request.params as { entity: string };
      const body = z.object({
        fieldKey: z.string().regex(/^[a-z][a-z0-9_]*$/, 'lowercase letters, digits, underscores only').max(60),
        label: z.string().trim().min(1).max(80),
        fieldType: z.enum(['text', 'number', 'date', 'boolean', 'select']).default('text'),
        options: z.object({ choices: z.array(z.string()) }).optional(),
        displayOrder: z.number().int().default(0),
        required: z.boolean().default(false),
      }).parse(request.body);

      const [created] = await fastify.db
        .insert(tenantCustomFieldDefs)
        .values({
          tenantId: request.tenantId,
          entityType: entity,
          fieldKey: body.fieldKey,
          label: body.label,
          fieldType: body.fieldType,
          options: body.options ?? null,
          displayOrder: body.displayOrder,
          required: body.required,
        })
        .returning();
      reply.code(201);
      return created;
    },
  );

  fastify.delete(
    '/api/v1/custom-fields/:id',
    { preHandler: [fastify.authenticate, requirePermission('*')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      await fastify.db
        .delete(tenantCustomFieldDefs)
        .where(and(
          eq(tenantCustomFieldDefs.id, id),
          eq(tenantCustomFieldDefs.tenantId, request.tenantId),
        ));
      reply.code(204).send();
    },
  );

  // ===== Discovered lookup values (for dropdown UIs) =====
  // GET /api/v1/lookup-values/customer/territory → all distinct territories sorted by usage
  fastify.get(
    '/api/v1/lookup-values/:entity/:field',
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const { entity, field } = request.params as { entity: string; field: string };
      return fastify.db
        .select({
          value: tenantLookupValues.value,
          usageCount: tenantLookupValues.usageCount,
          lastSeenAt: tenantLookupValues.lastSeenAt,
        })
        .from(tenantLookupValues)
        .where(and(
          eq(tenantLookupValues.tenantId, request.tenantId),
          eq(tenantLookupValues.entityType, entity),
          eq(tenantLookupValues.field, field),
        ))
        .orderBy(sql`${tenantLookupValues.usageCount} DESC`)
        .limit(500);
    },
  );
}
