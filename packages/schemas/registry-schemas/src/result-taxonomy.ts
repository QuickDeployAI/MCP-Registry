import {
  CAPABILITY_TYPES,
  CAPABILITY_TYPE_LABELS,
  getCapabilityCategory,
  type CapabilityCategory,
  type CapabilityType,
} from "./capability.js";

/**
 * Plain-English, protocol-free labels for each capability type. Marketplace
 * search-result chrome (advanced filters, result counts, compact type badges)
 * should use these instead of `CAPABILITY_TYPE_LABELS` — which stays reserved
 * for detail pages, the API, the CLI, and admin surfaces, where the
 * underlying protocol name (MCP, A2A, ACP, ...) is useful information rather
 * than jargon a first-time buyer has to learn before they can compare
 * results. Related protocols intentionally collapse onto the same label
 * (`a2a` and `acp` both read as "Hosted Agent") because that distinction
 * belongs at the detail/technical layer, not the first-glance result card.
 */
export const RESULT_KIND_LABELS: Record<CapabilityType, { one: string; other: string }> = {
  mcp: { one: "Tool Connector", other: "Tool Connectors" },
  "agent-skill": { one: "Agent Skill", other: "Agent Skills" },
  a2a: { one: "Hosted Agent", other: "Hosted Agents" },
  acp: { one: "Hosted Agent", other: "Hosted Agents" },
  ssh: { one: "Infrastructure Access", other: "Infrastructure Access" },
  workflow: { one: "Workflow Template", other: "Workflow Templates" },
  pack: { one: "Governed Kit", other: "Governed Kits" },
  docs: { one: "Knowledge Source", other: "Knowledge Sources" },
  openui: { one: "Interactive App", other: "Interactive Apps" },
  "json-render": { one: "Interactive App", other: "Interactive Apps" },
  "mcp-apps": { one: "Interactive App", other: "Interactive Apps" },
  chatkit: { one: "Interactive App", other: "Interactive Apps" },
  a2ui: { one: "Interactive App", other: "Interactive Apps" },
};

/** Plain-English kind label for `type`, singular unless `count !== 1`. */
export function getResultKindLabel(type: CapabilityType, count = 1): string {
  const entry = RESULT_KIND_LABELS[type];
  return count === 1 ? entry.one : entry.other;
}

/**
 * Setup-state vocabulary a search result surfaces before deploy. Fixed to
 * these four values so every result type reports state the same way,
 * independent of which protocol-specific policy/connector machinery produced
 * the underlying blockers.
 */
export const RESULT_SETUP_STATES = [
  "available",
  "needs-admin-approval",
  "needs-connector-setup",
  "unavailable",
] as const;
export type ResultSetupState = (typeof RESULT_SETUP_STATES)[number];

export interface ResultSetupStateInfo {
  state: ResultSetupState;
  /** Plain-English label matching the state exactly (e.g. "Needs admin approval"). */
  label: string;
  /**
   * Why the state applies, in plain language. Every non-"available" state
   * must carry at least one reason — a result should never go quiet about
   * why it's blocked instead of just being hidden.
   */
  reasons: readonly string[];
}

/**
 * Derive a compact setup state from raw governance signals — an explicit
 * unavailability reason, policy blockers, and missing connector/setup steps
 * — without exposing policy-engine or connector internals in primary
 * search-result chrome. Precedence: unavailable > needs-admin-approval >
 * needs-connector-setup > available, so the most actionable single state
 * wins rather than stacking every applicable one.
 */
export function deriveResultSetupState(input: {
  unavailableReasons?: readonly string[];
  policyBlockers?: readonly string[];
  missingSetup?: readonly string[];
}): ResultSetupStateInfo {
  const unavailableReasons = input.unavailableReasons ?? [];
  if (unavailableReasons.length > 0) {
    return { state: "unavailable", label: "Unavailable", reasons: unavailableReasons };
  }
  const policyBlockers = input.policyBlockers ?? [];
  if (policyBlockers.length > 0) {
    return {
      state: "needs-admin-approval",
      label: "Needs admin approval",
      reasons: policyBlockers,
    };
  }
  const missingSetup = input.missingSetup ?? [];
  if (missingSetup.length > 0) {
    return {
      state: "needs-connector-setup",
      label: "Needs connector setup",
      reasons: missingSetup,
    };
  }
  return { state: "available", label: "Available to your team", reasons: [] };
}

/** One row of the stable, agent/CLI-readable result taxonomy export. */
export interface ResultTaxonomyEntry {
  /** The underlying protocol type — the technical vocabulary this taxonomy hides from primary UI. */
  type: CapabilityType;
  category: CapabilityCategory;
  /** Plain-English kind label (plural form, for catalog-style listings). */
  kindLabel: string;
  /** The existing technical label, still surfaced to detail/API/CLI/admin consumers. */
  technicalLabel: string;
}

/**
 * Stable JSON-serializable export of the full result taxonomy: every
 * capability type, the category it groups under, its plain-English kind
 * label, and its technical label. Intended for registry sync, CLI search,
 * and agent-readable feeds (e.g. the ARD catalog) that need the type/label
 * mapping without duplicating it.
 */
export function buildResultTaxonomyExport(): readonly ResultTaxonomyEntry[] {
  return CAPABILITY_TYPES.map((type) => ({
    type,
    category: getCapabilityCategory(type),
    kindLabel: getResultKindLabel(type, 2),
    technicalLabel: CAPABILITY_TYPE_LABELS[type],
  }));
}
