/**
 * Plan-based entitlements. Single source of truth for "what can this tenant do?"
 * Used on both the API (enforcement) and the frontend (hide unavailable UI).
 *
 * Keep this file pure — no DB, no fastify, no React. Just plan → capabilities.
 */

export type PlanTier = 'starter' | 'pro' | 'enterprise';

export type FeatureKey =
  // Integrations
  | 'quickbooks'
  | 'pax8'
  | 'connectbooster'
  | 'ninja_rmm'
  | 'crewhu'
  // AI
  | 'ai_assistant'
  // SLA + workflow
  | 'sla_policies'
  | 'sla_escalation'
  // Comms
  | 'twilio_sms'
  // Auth
  | 'microsoft_sso'
  | 'google_sso'
  | 'saml_sso'
  // Data import / migration tools (ConnectWise, Autotask, Halo, CSV)
  | 'data_import'
  // Enterprise-only
  | 'dedicated_instance'
  | 'custom_portal_domain'
  | 'named_csm';

export interface Entitlements {
  plan: PlanTier;
  maxBillableUsers: number; // 'owner' + 'admin' + 'tech' roles — portal users are always free
  features: Record<FeatureKey, boolean>;
}

const STARTER_FEATURES: Record<FeatureKey, boolean> = {
  quickbooks: false,
  pax8: false,
  connectbooster: false,
  ninja_rmm: false,
  crewhu: false,
  ai_assistant: false,
  sla_policies: false,
  sla_escalation: false,
  twilio_sms: false,
  microsoft_sso: false,
  google_sso: true, // available on every plan
  saml_sso: false,
  data_import: false,
  dedicated_instance: false,
  custom_portal_domain: false,
  named_csm: false,
};

const PRO_FEATURES: Record<FeatureKey, boolean> = {
  ...STARTER_FEATURES,
  quickbooks: true,
  pax8: true,
  connectbooster: true,
  ninja_rmm: true,
  crewhu: true,
  ai_assistant: true,
  sla_policies: true,
  sla_escalation: true,
  twilio_sms: true,
  microsoft_sso: true,
  data_import: true,
};

const ENTERPRISE_FEATURES: Record<FeatureKey, boolean> = {
  ...PRO_FEATURES,
  saml_sso: true,
  dedicated_instance: true,
  custom_portal_domain: true,
  named_csm: true,
};

const PLAN_DEFAULTS: Record<PlanTier, { maxBillableUsers: number; features: Record<FeatureKey, boolean> }> = {
  starter: { maxBillableUsers: 3, features: STARTER_FEATURES },
  pro: { maxBillableUsers: 15, features: PRO_FEATURES },
  enterprise: { maxBillableUsers: Number.MAX_SAFE_INTEGER, features: ENTERPRISE_FEATURES },
};

/**
 * Compute a tenant's effective entitlements given their plan + any per-tenant overrides.
 *
 * Per-tenant feature_flags override both directions — you can grant a starter tenant
 * QuickBooks access for a pilot, or block Pro tenants from a feature being deprecated.
 */
export function computeEntitlements(
  plan: PlanTier | string | null | undefined,
  featureFlagOverrides: Record<string, boolean> | null | undefined = {},
): Entitlements {
  const tier: PlanTier =
    plan === 'pro' ? 'pro' : plan === 'enterprise' ? 'enterprise' : 'starter';
  const base = PLAN_DEFAULTS[tier];

  const features = { ...base.features };
  const overrides = featureFlagOverrides ?? {};

  for (const [key, enabled] of Object.entries(overrides)) {
    if (key in features) {
      features[key as FeatureKey] = !!enabled;
    }
  }

  return {
    plan: tier,
    maxBillableUsers: base.maxBillableUsers,
    features,
  };
}

/**
 * Convenience check. Returns true if the tenant has the feature (plan default OR flag override).
 */
export function hasFeature(ent: Entitlements, feature: FeatureKey): boolean {
  return ent.features[feature] === true;
}
