import { z } from "zod";
import type { CapabilityType } from "./capability.js";
import type { InferenceResult } from "./inference.js";

/**
 * OASF (Open Agentic Schema Framework) interop. AGNTCY's Agent Directory (`dir`)
 * announces and discovers agents described as OASF records. This module is the
 * single bidirectional bridge between OASF records and the marketplace capability
 * taxonomy:
 *
 *   - {@link oasfToCapability} (import)  — an OASF record discovered from a `dir`
 *     instance → a capability listing shaped like {@link InferenceResult}.
 *   - {@link capabilityToOasf} (export)  — a published capability → an OASF record
 *     suitable for announcing to `dir`.
 *
 * Per ADR 0012, AGNTCY agents are **subsumed under the existing `a2a` / `mcp`
 * capability types** (whichever locator the record exposes) rather than getting a
 * new top-level type — the unqualified `acp` type belongs to Zed's Agent *Client*
 * Protocol, and AGNTCY's Agent *Connect* Protocol / SLIM is modeled here as an
 * invocation **transport**, not a catalog type.
 *
 * The module is pure and runtime-agnostic (no IO) so it can be consumed from both
 * Node (marketplace / account-hub) and the Deno edge functions, exactly like
 * {@link inference}. OASF is an extensible schema, so the Zod shapes below validate
 * the fields we read while passing unknown keys through untouched.
 */

/** A distribution/connectivity locator on an OASF record. */
export const OasfLocatorSchema = z
  .object({
    type: z.string(),
    url: z.string().optional(),
    size: z.number().optional(),
    digest: z.string().optional(),
  })
  .catchall(z.unknown());
export type OasfLocator = z.infer<typeof OasfLocatorSchema>;

/** An OASF extension/module describing a capability feature (a2a, mcp, runtime…). */
export const OasfExtensionSchema = z
  .object({
    name: z.string(),
    version: z.string().optional(),
    data: z.unknown().optional(),
  })
  .catchall(z.unknown());
export type OasfExtension = z.infer<typeof OasfExtensionSchema>;

export const OasfSkillSchema = z
  .object({
    name: z.string().optional(),
    id: z.union([z.string(), z.number()]).optional(),
  })
  .catchall(z.unknown());
export type OasfSkill = z.infer<typeof OasfSkillSchema>;

/** An OASF agent record, as announced/discovered through an AGNTCY directory. */
export const OasfRecordSchema = z
  .object({
    name: z.string(),
    version: z.string().optional(),
    schema_version: z.string().optional(),
    description: z.string().optional(),
    authors: z.array(z.string()).optional(),
    created_at: z.string().optional(),
    skills: z.array(OasfSkillSchema).optional(),
    locators: z.array(OasfLocatorSchema).optional(),
    extensions: z.array(OasfExtensionSchema).optional(),
    annotations: z.record(z.string(), z.string()).optional(),
    signature: z.record(z.string(), z.unknown()).optional(),
  })
  .catchall(z.unknown());
export type OasfRecord = z.infer<typeof OasfRecordSchema>;

/** How an AGNTCY agent is invoked once cataloged. Not a catalog type — a transport. */
export const AgntcyTransportSchema = z.enum(["http", "slim", "acp"]);
export type AgntcyTransport = z.infer<typeof AgntcyTransportSchema>;

/** The fixed source label applied to listings imported from a `dir` instance. */
export const AGNTCY_DIR_SOURCE = "agntcy-dir" as const;

/** Lowercased locator + extension type/name tokens, used to sniff protocol/transport. */
function recordTokens(record: OasfRecord): string[] {
  const out: string[] = [];
  for (const locator of record.locators ?? []) {
    if (locator.type) out.push(locator.type.toLowerCase());
  }
  for (const extension of record.extensions ?? []) {
    if (extension.name) out.push(extension.name.toLowerCase());
  }
  return out;
}

/**
 * Resolve which marketplace capability type an OASF record maps to. MCP-exposing
 * records become `mcp`; everything else agent-shaped (A2A, Connect Protocol, SLIM,
 * or bare) becomes `a2a`, the closest agent type.
 */
export function resolveOasfCapabilityType(record: OasfRecord): CapabilityType {
  const tokens = recordTokens(record);
  if (tokens.some((token) => token.includes("mcp"))) return "mcp";
  return "a2a";
}

/** Resolve the invocation transport implied by an OASF record's locators/extensions. */
export function resolveAgntcyTransport(record: OasfRecord): AgntcyTransport {
  const tokens = recordTokens(record);
  if (tokens.some((token) => token.includes("slim"))) return "slim";
  if (tokens.some((token) => token.includes("acp") || token.includes("connect"))) return "acp";
  return "http";
}

/** First locator carrying a URL — the agent's service endpoint, if advertised. */
function pickServiceEndpoint(record: OasfRecord): string | undefined {
  for (const locator of record.locators ?? []) {
    if (locator.url) return locator.url;
  }
  return undefined;
}

/** The OASF locator type used when announcing a capability of the given type. */
function oasfLocatorTypeForCapability(type: CapabilityType): string {
  switch (type) {
    case "mcp":
      return "mcp-server";
    case "a2a":
      return "a2a-agent-card";
    default:
      return "remote";
  }
}

export interface OasfImportResult {
  /** Marketplace capability type this record is cataloged as. */
  type: CapabilityType;
  /** Invocation transport (Connect Protocol / SLIM / plain HTTP). */
  transport: AgntcyTransport;
  /** Listing fields, shaped identically to {@link inferListingFromManifest}. */
  inference: InferenceResult;
}

/**
 * Import direction: map an OASF record (validated) discovered from a `dir` instance
 * into a capability listing. The raw record is preserved as `manifest`; the
 * `source` marker drives the "AGNTCY" badge on discovery surfaces.
 */
export function oasfToCapability(record: OasfRecord | unknown): OasfImportResult {
  const parsed = OasfRecordSchema.parse(record);
  const type = resolveOasfCapabilityType(parsed);
  const transport = resolveAgntcyTransport(parsed);
  const serviceEndpoint = pickServiceEndpoint(parsed);

  const inference: InferenceResult = {
    name: parsed.name,
    version: parsed.version,
    description: parsed.description,
    publisher: parsed.authors?.[0],
    inferred: {
      source: AGNTCY_DIR_SOURCE,
      transport,
      serviceEndpoint,
      authors: parsed.authors ?? [],
      skills: (parsed.skills ?? [])
        .map((skill) => skill.name)
        .filter((name): name is string => typeof name === "string"),
      locators: parsed.locators ?? [],
      annotations: parsed.annotations ?? {},
      schemaVersion: parsed.schema_version,
    },
    manifest: parsed,
    missingRequired: parsed.name ? [] : ["name"],
  };

  return { type, transport, inference };
}

/**
 * The curated, public-only fields used to announce a capability to `dir`. By taking
 * an explicit shape (not a raw manifest) secrets cannot leak by construction; as a
 * defensive backstop {@link capabilityToOasf} also strips secret-looking annotation
 * keys before emitting the record.
 */
export interface CapabilityExportInput {
  type: CapabilityType;
  name: string;
  version?: string;
  description?: string;
  publisher?: string;
  authors?: string[];
  license?: string;
  /** Publicly reachable endpoint for the agent, if any. */
  serviceEndpoint?: string;
  skills?: Array<{ name: string }>;
  /** Public OCI-style annotations. Secret-looking keys are dropped on export. */
  annotations?: Record<string, string>;
}

const SECRET_ANNOTATION_KEY = /secret|token|password|credential|api[-_]?key|private[-_]?key/i;

/** Drop annotation keys that look like they reference secrets — never announce these. */
function stripSecretAnnotations(
  annotations: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!annotations) return undefined;
  const safe: Record<string, string> = {};
  for (const [key, value] of Object.entries(annotations)) {
    if (!SECRET_ANNOTATION_KEY.test(key)) safe[key] = value;
  }
  return Object.keys(safe).length > 0 ? safe : undefined;
}

/**
 * Export direction: build an OASF record for announcing a published capability to a
 * `dir` instance. Only the curated public fields are emitted; security blocks and
 * secret references from the source manifest are intentionally never included.
 */
export function capabilityToOasf(input: CapabilityExportInput): OasfRecord {
  const locators: OasfLocator[] = [];
  if (input.serviceEndpoint) {
    locators.push({ type: oasfLocatorTypeForCapability(input.type), url: input.serviceEndpoint });
  }

  const authors = input.authors ?? (input.publisher ? [input.publisher] : undefined);

  return OasfRecordSchema.parse({
    name: input.name,
    version: input.version ?? "0.0.0",
    description: input.description,
    authors,
    skills: input.skills,
    locators,
    annotations: stripSecretAnnotations(
      input.license
        ? { ...(input.annotations ?? {}), license: input.license }
        : input.annotations,
    ),
  });
}
