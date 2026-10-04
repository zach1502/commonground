import { rule as adapterBoundary } from './rules/adapter-boundary.js';
import { rule as catalogIntegrity } from './rules/catalog-integrity.js';
import { rule as constantsHome } from './rules/constants-home.js';
import { rule as contentPatterns } from './rules/content-patterns.js';
import { rule as contentRedundancy } from './rules/content-redundancy.js';
import { rule as contentTerminology } from './rules/content-terminology.js';
import { rule as contentWordlist } from './rules/content-wordlist.js';
import { rule as designTokens } from './rules/design-tokens.js';
import { rule as disableAudit } from './rules/disable-audit.js';
import { rule as docsInSync } from './rules/docs-in-sync.js';
import { rule as envDocumented } from './rules/env-documented.js';
import { rule as fileBudget } from './rules/file-budget.js';
import { rule as licenceAttribution } from './rules/licence-attribution.js';
import { rule as noRawEnv } from './rules/no-raw-env.js';
import { rule as openapiDrift } from './rules/openapi-drift.js';
import { rule as portContractCoverage } from './rules/port-contract-coverage.js';
import { rule as readability } from './rules/readability.js';
import { rule as tddPairing } from './rules/tdd-pairing.js';
import { rule as todoAudit } from './rules/todo-audit.js';
import type { PreflightRule } from './types.js';

/** Every preflight rule, in the order runs and generated tables list them. */
export const registry: readonly PreflightRule[] = [
  adapterBoundary,
  portContractCoverage,
  tddPairing,
  envDocumented,
  noRawEnv,
  constantsHome,
  contentWordlist,
  contentPatterns,
  contentRedundancy,
  contentTerminology,
  readability,
  designTokens,
  disableAudit,
  todoAudit,
  fileBudget,
  docsInSync,
  licenceAttribution,
  catalogIntegrity,
  openapiDrift,
];

export function findRule(id: string): PreflightRule | undefined {
  return registry.find((rule) => rule.id === id);
}
