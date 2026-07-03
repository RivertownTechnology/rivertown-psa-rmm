import type { FrameworkData } from './types.js';
import { CJIS_FRAMEWORK } from './cjis.js';
import { CMMC_FRAMEWORK } from './cmmc.js';
import { HIPAA_FRAMEWORK } from './hipaa.js';
import { PCI_FRAMEWORK } from './pci.js';
import { CIS_V8_FRAMEWORK } from './cis-v8.js';
import { NIST_CSF_FRAMEWORK } from './nist-csf.js';

export type { FrameworkData, FrameworkAreaDef, FrameworkControlDef } from './types.js';

/** Built-in frameworks keyed by seed type. */
export const FRAMEWORKS: Record<string, FrameworkData> = {
  cjis: CJIS_FRAMEWORK,
  cmmc: CMMC_FRAMEWORK,
  hipaa: HIPAA_FRAMEWORK,
  pci: PCI_FRAMEWORK,
  cis: CIS_V8_FRAMEWORK,
  'nist-csf': NIST_CSF_FRAMEWORK,
};
