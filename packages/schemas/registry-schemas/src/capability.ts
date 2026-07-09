import { z } from "zod";

/**
 * The canonical marketplace capability taxonomy. This used to live in
 * `apps/quick-deploy-marketplace/src/lib/schemas/capability.ts`; it now lives in
 * this shared package so both the marketplace and account-hub agree on the set
 * of protocols, categories, and labels. The marketplace file re-exports from
 * here.
 */
export const CapabilityTypeSchema = z.enum([
  "mcp",
  "agent-skill",
  "a2a",
  "acp",
  "ssh",
  "workflow",
  "pack",
  // Knowledge / documents (RAG knowledge bases).
  "docs",
  // GenUI subtypes (generative / model-driven UI surfaces).
  "openui",
  "json-render",
  "mcp-apps",
  "chatkit",
  "a2ui",
]);

export type CapabilityType = z.infer<typeof CapabilityTypeSchema>;

/** All capability types as a readonly tuple. */
export const CAPABILITY_TYPES = CapabilityTypeSchema.options;

/**
 * Top-level marketplace categories. Each category groups one or more
 * capability types; the underlying types stay addressable as advanced options.
 */
export const CapabilityCategorySchema = z.enum([
  "tools",
  "agents",
  "workflows",
  "packs",
  "genui",
  "docs",
]);

export type CapabilityCategory = z.infer<typeof CapabilityCategorySchema>;

export const CAPABILITY_CATEGORY_TYPES: Record<CapabilityCategory, readonly CapabilityType[]> = {
  tools: ["mcp", "agent-skill"],
  agents: ["a2a", "acp", "ssh"],
  workflows: ["workflow"],
  packs: ["pack"],
  // Default-first order: OpenUI is the canonical builder output, json-render second.
  genui: ["openui", "json-render", "mcp-apps", "chatkit", "a2ui"],
  docs: ["docs"],
};

export const CAPABILITY_TYPE_LABELS: Record<CapabilityType, string> = {
  mcp: "MCP Servers",
  "agent-skill": "Agent Skills",
  a2a: "A2A Agents",
  acp: "ACP Agents",
  ssh: "SSH",
  workflow: "Workflows",
  pack: "Packs",
  docs: "Docs & Knowledge",
  openui: "Thesys / OpenUI",
  "json-render": "JSON-render",
  "mcp-apps": "MCP Apps",
  chatkit: "OpenAI ChatKit",
  a2ui: "A2UI",
};

export function getCapabilityCategory(type: CapabilityType): CapabilityCategory {
  for (const [category, types] of Object.entries(CAPABILITY_CATEGORY_TYPES) as [
    CapabilityCategory,
    readonly CapabilityType[],
  ][]) {
    if (types.includes(type)) return category;
  }
  return "tools";
}

/** Filter values accepted by marketplace browsing surfaces. */
export type MarketplaceCapabilityFilter = "all" | CapabilityCategory | CapabilityType;

export function resolveCapabilityFilterTypes(
  filter: MarketplaceCapabilityFilter,
): readonly CapabilityType[] {
  if (filter === "all") return CapabilityTypeSchema.options;
  if (filter in CAPABILITY_CATEGORY_TYPES)
    return CAPABILITY_CATEGORY_TYPES[filter as CapabilityCategory];
  return [filter as CapabilityType];
}
