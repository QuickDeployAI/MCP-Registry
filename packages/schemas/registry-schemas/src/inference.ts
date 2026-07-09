import type { CapabilityType } from "./capability";

/**
 * Manifest inference. Given a parsed artifact (server.json, agent card, SKILL.md
 * text, workflow/pack/ssh/acp definition) this extracts the fields that can be
 * inferred per protocol and reports which required fields still need manual
 * entry. Pure and runtime-agnostic so it can run in the browser (account-hub
 * upload forms, client-side zip parsing) and be mirrored by the Deno edge
 * function for server-side external-URL fetches.
 */
export interface InferenceResult {
  name: string;
  publisher?: string;
  version?: string;
  description?: string;
  subtype?: string;
  /** Fields auto-extracted from the manifest, surfaced read-only in the UI. */
  inferred: Record<string, unknown>;
  /** The normalized manifest (best-effort, protocol-shaped). */
  manifest: Record<string, unknown>;
  /** Required fields that could not be inferred and must be filled manually. */
  missingRequired: string[];
}

type AnyRecord = Record<string, unknown>;

function asRecord(value: unknown): AnyRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as AnyRecord) : {};
}

function str(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  return undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Parse the YAML-ish frontmatter block at the top of a SKILL.md file. */
export function parseSkillFrontmatter(markdown: string): {
  frontmatter: AnyRecord;
  body: string;
} {
  const match = /^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/.exec(markdown);
  if (!match) return { frontmatter: {}, body: markdown };
  const [, rawFm, body] = match;
  const frontmatter: AnyRecord = {};
  let activeArrayKey: string | undefined;
  for (const line of rawFm.split("\n")) {
    const arrayItem = /^\s*-\s*(.*)$/.exec(line);
    if (arrayItem && activeArrayKey) {
      const value = arrayItem[1].replace(/^["']|["']$/g, "").trim();
      if (value.length > 0) (frontmatter[activeArrayKey] as string[]).push(value);
      continue;
    }

    const kv = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line.trim());
    if (!kv) {
      activeArrayKey = undefined;
      continue;
    }
    const [, key, rawValue] = kv;
    const value = rawValue.replace(/^["']|["']$/g, "").trim();
    if (value.length > 0) {
      frontmatter[key] = value;
      activeArrayKey = undefined;
    } else {
      frontmatter[key] = [];
      activeArrayKey = key;
    }
  }
  return { frontmatter, body: body ?? "" };
}

function inferMcp(raw: unknown): InferenceResult {
  const m = asRecord(raw);
  const name = str(m.name);
  const version = str(m.version);
  const description = str(m.description);
  const packages = asArray(m.packages);
  const remotes = asArray(m.remotes);
  const inferred: AnyRecord = {
    title: str(m.title),
    repository: m.repository ?? undefined,
    websiteUrl: str(m.websiteUrl),
    icons: m.icons ?? undefined,
    packages,
    remotes,
    tools: asArray(m.tools),
    resources: asArray(m.resources),
    prompts: asArray(m.prompts),
  };
  const missingRequired: string[] = [];
  if (!name) missingRequired.push("name");
  if (packages.length === 0 && remotes.length === 0) missingRequired.push("runtime");
  return { name: name ?? "", version, description, inferred, manifest: m, missingRequired };
}

function inferAgentSkill(raw: unknown): InferenceResult {
  const { frontmatter, body } =
    typeof raw === "string" ? parseSkillFrontmatter(raw) : { frontmatter: asRecord(raw), body: "" };
  const name = str(frontmatter.name);
  const description = str(frontmatter.description);
  const inferred: AnyRecord = {
    license: str(frontmatter.license),
    compatibility: str(frontmatter.compatibility),
    allowedTools: str(frontmatter["allowed-tools"]),
    metadata: frontmatter.metadata,
    hasBody: typeof body === "string" && body.trim().length > 0,
  };
  const missingRequired: string[] = [];
  if (!name) missingRequired.push("name");
  if (!description) missingRequired.push("description");
  return {
    name: name ?? "",
    description,
    inferred,
    manifest: { frontmatter, body },
    missingRequired,
  };
}

function inferA2a(raw: unknown): InferenceResult {
  const card = asRecord(raw);
  const name = str(card.name);
  const version = str(card.version);
  const description = str(card.description);
  const serviceEndpoint = str(card.url) ?? str(card.serviceEndpoint);
  const provider = asRecord(card.provider);
  const inferred: AnyRecord = {
    serviceEndpoint,
    providerName: str(provider.organization) ?? str(card.providerName),
    capabilities: card.capabilities ?? {},
    skills: asArray(card.skills),
    icons: asArray(card.icons),
    documentationUrl: str(card.documentationUrl),
  };
  const missingRequired: string[] = [];
  if (!name) missingRequired.push("name");
  if (!serviceEndpoint) missingRequired.push("serviceEndpoint");
  return {
    name: name ?? "",
    version,
    description,
    publisher: inferred.providerName as string | undefined,
    inferred,
    manifest: card,
    missingRequired,
  };
}

function inferAcp(raw: unknown): InferenceResult {
  const card = asRecord(raw);
  const name = str(card.name) ?? str(card.agent_id);
  const version = str(card.version);
  const description = str(card.description);
  const inferred: AnyRecord = {
    agentId: str(card.agent_id) ?? str(card.agentId),
    repositoryUrl: str(card.repository_url) ?? str(card.repositoryUrl),
    authors: asArray(card.authors),
    license: str(card.license),
    icon: card.icon ?? undefined,
  };
  const missingRequired: string[] = [];
  if (!name) missingRequired.push("name");
  return { name: name ?? "", version, description, inferred, manifest: card, missingRequired };
}

function inferSsh(raw: unknown): InferenceResult {
  const m = asRecord(raw);
  const name = str(m.name) ?? str(m.agent_id);
  const version = str(m.version);
  const description = str(m.description);
  const inferred: AnyRecord = {
    framework: str(m.framework),
    availability: str(m.availability),
    runtimeRequirements: asRecord(m.runtime_requirements ?? m.runtimeRequirements),
    deployTargets: asArray(m.deploy_targets ?? m.deployTargets),
    testPacks: asArray(m.test_packs ?? m.testPacks),
    endpoints: asRecord(m.endpoints),
  };
  const missingRequired: string[] = [];
  if (!name) missingRequired.push("name");
  if (!inferred.framework) missingRequired.push("framework");
  return { name: name ?? "", version, description, inferred, manifest: m, missingRequired };
}

function inferWorkflow(raw: unknown): InferenceResult {
  const m = asRecord(raw);
  const name = str(m.name) ?? str(m.title);
  const version = str(m.version);
  const description = str(m.description);
  const inferred: AnyRecord = {
    triggers: asArray(m.triggers),
    steps: asArray(m.steps),
    requiredCapabilities: asArray(m.required_capabilities ?? m.requiredCapabilities),
    policy: asRecord(m.policy),
    deployTargets: asArray(m.deploy_targets ?? m.deployTargets),
  };
  const missingRequired: string[] = [];
  if (!name) missingRequired.push("name");
  if (asArray(m.steps).length === 0) missingRequired.push("steps");
  return { name: name ?? "", version, description, inferred, manifest: m, missingRequired };
}

function inferPack(raw: unknown): InferenceResult {
  const m = asRecord(raw);
  const name = str(m.title) ?? str(m.name);
  const version = str(m.version);
  const description = str(m.description);
  const inferred: AnyRecord = {
    publisher: str(m.publisher),
    capabilities: asArray(m.capabilities),
    governance: asRecord(m.governance),
    modes: m.modes ?? {},
    sourceKitId: str(m.source_kit_id ?? m.sourceKitId),
  };
  const missingRequired: string[] = [];
  if (!name) missingRequired.push("name");
  if (asArray(m.capabilities).length === 0) missingRequired.push("capabilities");
  return {
    name: name ?? "",
    version,
    description,
    publisher: inferred.publisher as string | undefined,
    inferred,
    manifest: m,
    missingRequired,
  };
}

// GenUI subtypes (openui, json-render, mcp-apps, chatkit, a2ui) intentionally
// have no dedicated parser yet — they fall back to the generic inference below.
const INFERERS: Partial<Record<CapabilityType, (raw: unknown) => InferenceResult>> = {
  mcp: inferMcp,
  "agent-skill": inferAgentSkill,
  a2a: inferA2a,
  acp: inferAcp,
  ssh: inferSsh,
  workflow: inferWorkflow,
  pack: inferPack,
};

/**
 * Infer listing fields for a protocol from a parsed manifest / external source.
 * `raw` may be a parsed object, or (for agent-skill) raw SKILL.md text.
 */
export function inferListingFromManifest(protocol: CapabilityType, raw: unknown): InferenceResult {
  const inferer = INFERERS[protocol];
  if (inferer) return inferer(raw);
  // Generic fallback (e.g. GenUI subtypes): best-effort name/description.
  const m = asRecord(raw);
  const name = str(m.name) ?? str(m.title);
  return {
    name: name ?? "",
    version: str(m.version),
    description: str(m.description),
    inferred: {},
    manifest: m,
    missingRequired: name ? [] : ["name"],
  };
}
