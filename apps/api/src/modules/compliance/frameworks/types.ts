// Shared shape for built-in compliance framework content.
// Content in these files is the source of truth for built-in frameworks;
// syncFramework() upserts it into the DB by shortName / area code / controlCode.

export interface FrameworkControlDef {
  /** Stable control identifier (e.g. '164.312(a)(2)(iv)', 'AC.L2-3.1.1'). Upsert key — never change. */
  code: string;
  title: string;
  /** One-sentence requirement statement. */
  description: string;
  /** Multi-sentence plain-language explanation: what the control means in IT terms,
   *  how an MSP typically implements/verifies it. Stored in compliance_controls.guidance. */
  explanation?: string;
  /** Concrete example evidence or a model assessment note showing the expected level of
   *  detail. Stored in compliance_controls.example. */
  example?: string;
  /** NIST 800-53 mapping (e.g. 'IA-2(1)'). */
  nist?: string;
  type: 'technical' | 'administrative' | 'physical';
  severity?: 'critical' | 'high' | 'medium' | 'low';
  /** automationSource: ncentral | huntress | nodeware | sentinelone | duo | m365 | asset_data */
  auto?: string;
  /** automationCheck key (e.g. 'mfa_enrolled', 'disk_encryption'). */
  autoCheck?: string;
}

export interface FrameworkAreaDef {
  /** Stable area code (e.g. 'PA-5', 'REQ-8', 'IA'). Upsert key — never change. */
  code: string;
  title: string;
  description?: string;
  controls: FrameworkControlDef[];
}

export interface FrameworkData {
  key: string;
  name: string;
  /** Upsert key per tenant — never change for an existing framework. */
  shortName: string;
  version: string;
  description: string;
  nistMappingEnabled: boolean;
  /** Bump on any content edit so installs can tell content versions apart. */
  contentVersion: number;
  metadata: Record<string, string>;
  areas: FrameworkAreaDef[];
}
