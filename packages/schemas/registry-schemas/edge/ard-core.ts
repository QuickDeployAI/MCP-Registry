/**
 * Agentic Resource Discovery (ARD) — Deno mirror of the pure core.
 *
 * The canonical TypeScript source is packages/schemas/registry-schemas/src/ard.ts.
 * Edge functions are Deno and do not import the Node workspace package (same
 * convention as _shared/capability-validation-core.ts mirroring validation.ts),
 * so the pure ARD logic the ard-catalog / ard-search / ard-federation functions
 * need — the capability↔media-type mapping, urn helpers, trust-manifest
 * derivation, filter helpers, and the request parser — is mirrored here,
 * dependency-free (no zod). Keep the two in sync.
 */

// ── Constants ────────────────────────────────────────────────────────────────

export const ARD_SPEC_VERSION = "1.0";
export const ARD_REGISTRY_MEDIA_TYPE = "application/ai-registry+json";
export const AIR_URN_PREFIX = "urn:air";

export const ARD_SEARCH_MIN_PAGE_SIZE = 1;
export const ARD_SEARCH_MAX_PAGE_SIZE = 100;
export const ARD_SEARCH_DEFAULT_PAGE_SIZE = 10;
export const ARD_SEARCH_MAX_QUERY_LENGTH = 500;

// ── Capability ↔ media-type mapping (mirror of CAPABILITY_TO_MEDIA_TYPE) ──────

export type CapabilityType =
  | "mcp"
  | "agent-skill"
  | "a2a"
  | "acp"
  | "ssh"
  | "workflow"
  | "pack"
  | "docs"
  | "mcp-apps"
  | "openui"
  | "json-render"
  | "chatkit"
  | "a2ui";

export const CAPABILITY_TO_MEDIA_TYPE: Record<CapabilityType, string> = {
  "agent-skill": "application/ai-skill",
  mcp: "application/mcp-server-card+json",
  a2a: "application/a2a-agent-card+json",
  acp: "application/vnd.quickdeploy.acp-agent+json",
  ssh: "application/vnd.quickdeploy.ssh-agent+json",
  workflow: "application/vnd.quickdeploy.workflow+json",
  pack: "application/vnd.quickdeploy.pack+json",
  docs: "application/vnd.quickdeploy.docs+json",
  "mcp-apps": "application/vnd.quickdeploy.mcp-apps+json",
  openui: "application/vnd.quickdeploy.genui.openui+json",
  "json-render": "application/vnd.quickdeploy.genui.json-render+json",
  chatkit: "application/vnd.quickdeploy.genui.chatkit+json",
  a2ui: "application/vnd.quickdeploy.genui.a2ui+json",
};

export const MEDIA_TYPE_TO_CAPABILITY: Record<string, CapabilityType> = Object.fromEntries(
  (Object.entries(CAPABILITY_TO_MEDIA_TYPE) as [CapabilityType, string][]).map(
    ([capability, mediaType]) => [mediaType, capability],
  ),
);

export function capabilityToMediaType(type: CapabilityType): string {
  return CAPABILITY_TO_MEDIA_TYPE[type];
}

export function mediaTypeToCapability(mediaType: string): CapabilityType | null {
  return MEDIA_TYPE_TO_CAPABILITY[mediaType] ?? null;
}

// ── Source-definition artifacts ↔ capability kinds ───────────────────────────
// Mirror of packages/schemas/registry-schemas/src/ard.ts. Keep the media-type strings and
// both dispatch tables in sync; packages/schemas/registry-schemas/src/ard-sync.test.ts
// imports this file and fails when either mirror drifts.

/**
 * Internal "capability kind" taxonomy — artifact facets the registry derives from an
 * ARD entry's media `type` (for search/policy/routing). A kind is NOT a protocol
 * `CapabilityType`: an OpenAPI contract yields `api-contract` + a `tool` per
 * operation; an MCP server yields a `provider` plus introspected tool/resource/
 * prompt/task. Kinds are derived server-side, never authoritative on the wire.
 */
export type ArdCapabilityKind =
  | "api-contract"
  | "tool"
  | "provider"
  | "resource"
  | "prompt"
  | "event"
  | "workflow"
  | "agent"
  | "skill"
  | "task";

export const ARD_CAPABILITY_KINDS: readonly ArdCapabilityKind[] = [
  "api-contract",
  "tool",
  "provider",
  "resource",
  "prompt",
  "event",
  "workflow",
  "agent",
  "skill",
  "task",
];

export type ArdImportMode =
  | "whole-artifact"
  | "operation-level"
  | "method-level"
  | "skill-level"
  | "workflow-level";

export const ARD_IMPORT_MODES: readonly ArdImportMode[] = [
  "whole-artifact",
  "operation-level",
  "method-level",
  "skill-level",
  "workflow-level",
];

export const ARD_CATALOG_MEDIA_TYPE = "application/ai-catalog+json";

export const OPENAPI_MEDIA_TYPE = "application/vnd.oai.openapi+json";
export const OPENAPI_YAML_MEDIA_TYPE = "application/vnd.oai.openapi+yaml";
export const ASYNCAPI_MEDIA_TYPE = "application/vnd.asyncapi+json";
export const OPENRPC_MEDIA_TYPE = "application/vnd.open-rpc+json";
export const JSON_RPC_MEDIA_TYPE = "application/json-rpc";
export const WSDL_MEDIA_TYPE = "application/wsdl+xml";
export const GRPC_PROTO_MEDIA_TYPE = "application/protobuf";
export const ARAZZO_MEDIA_TYPE = "application/vnd.oai.arazzo+json";
export const POSTMAN_COLLECTION_MEDIA_TYPE = "application/vnd.postman.collection+json";
export const HAR_MEDIA_TYPE = "application/vnd.har+json";
export const ACP_AGENT_MANIFEST_MEDIA_TYPE = "application/acp-agent-manifest+json";
export const AI_SKILL_MD_MEDIA_TYPE = "application/ai-skill+md";
export const RSS_FEED_MEDIA_TYPE = "application/rss+xml";
export const QUICKDEPLOY_OKF_MEDIA_TYPE = "application/vnd.quickdeploy.okf+json";
export const QUICKDEPLOY_GIT_REPOSITORY_MEDIA_TYPE = "application/vnd.quickdeploy.git-repository";

export const SOURCE_ARTIFACT_MEDIA_TYPES: ReadonlySet<string> = new Set([
  OPENAPI_MEDIA_TYPE,
  OPENAPI_YAML_MEDIA_TYPE,
  ASYNCAPI_MEDIA_TYPE,
  OPENRPC_MEDIA_TYPE,
  JSON_RPC_MEDIA_TYPE,
  WSDL_MEDIA_TYPE,
  GRPC_PROTO_MEDIA_TYPE,
  ARAZZO_MEDIA_TYPE,
  POSTMAN_COLLECTION_MEDIA_TYPE,
  HAR_MEDIA_TYPE,
  ACP_AGENT_MANIFEST_MEDIA_TYPE,
  AI_SKILL_MD_MEDIA_TYPE,
  RSS_FEED_MEDIA_TYPE,
  QUICKDEPLOY_OKF_MEDIA_TYPE,
  QUICKDEPLOY_GIT_REPOSITORY_MEDIA_TYPE,
  ARD_CATALOG_MEDIA_TYPE,
  ARD_REGISTRY_MEDIA_TYPE,
  RSS_FEED_MEDIA_TYPE,
  QUICKDEPLOY_OKF_MEDIA_TYPE,
  QUICKDEPLOY_GIT_REPOSITORY_MEDIA_TYPE,
]);

export function isSourceArtifactMediaType(mediaType: string): boolean {
  return SOURCE_ARTIFACT_MEDIA_TYPES.has(mediaType);
}

const MEDIA_TYPE_ALIASES: Record<string, string> = {
  "application/openapi+json": OPENAPI_MEDIA_TYPE,
  "application/openapi+yaml": OPENAPI_YAML_MEDIA_TYPE,
  "application/x-yaml": OPENAPI_YAML_MEDIA_TYPE,
  "application/yaml": OPENAPI_YAML_MEDIA_TYPE,
  "text/x-yaml": OPENAPI_YAML_MEDIA_TYPE,
  "text/yaml": OPENAPI_YAML_MEDIA_TYPE,
  "application/vnd.asyncapi+yaml": ASYNCAPI_MEDIA_TYPE,
  "application/x-protobuf": GRPC_PROTO_MEDIA_TYPE,
  "application/proto": GRPC_PROTO_MEDIA_TYPE,
  "application/x-proto": GRPC_PROTO_MEDIA_TYPE,
  "application/rss": RSS_FEED_MEDIA_TYPE,
  "application/feed+xml": RSS_FEED_MEDIA_TYPE,
};

/**
 * Normalize an artifact media type for dispatch: lowercase, strip parameters,
 * and resolve common provisional aliases. Unknown values remain accepted.
 */
export function normalizeArtifactMediaType(mediaType: string): string {
  const canonical = mediaType.split(";")[0]?.trim().toLowerCase() ?? "";
  return MEDIA_TYPE_ALIASES[canonical] ?? canonical;
}

export const MEDIA_TYPE_TO_CAPABILITY_KINDS: Record<string, readonly ArdCapabilityKind[]> = {
  [OPENAPI_MEDIA_TYPE]: ["api-contract", "tool"],
  [OPENAPI_YAML_MEDIA_TYPE]: ["api-contract", "tool"],
  [ASYNCAPI_MEDIA_TYPE]: ["api-contract", "event", "tool"],
  [OPENRPC_MEDIA_TYPE]: ["api-contract", "tool"],
  [JSON_RPC_MEDIA_TYPE]: ["api-contract", "tool"],
  [WSDL_MEDIA_TYPE]: ["api-contract", "tool"],
  [GRPC_PROTO_MEDIA_TYPE]: ["api-contract", "tool"],
  [POSTMAN_COLLECTION_MEDIA_TYPE]: ["api-contract", "tool"],
  [HAR_MEDIA_TYPE]: ["api-contract", "tool"],
  [ARAZZO_MEDIA_TYPE]: ["workflow"],
  [CAPABILITY_TO_MEDIA_TYPE.mcp]: ["provider", "tool", "resource", "prompt", "task"],
  [CAPABILITY_TO_MEDIA_TYPE.a2a]: ["agent", "skill"],
  [ACP_AGENT_MANIFEST_MEDIA_TYPE]: ["agent", "skill"],
  [CAPABILITY_TO_MEDIA_TYPE["agent-skill"]]: ["skill", "resource"],
  [AI_SKILL_MD_MEDIA_TYPE]: ["skill", "resource"],
  [RSS_FEED_MEDIA_TYPE]: ["resource", "tool"],
  [QUICKDEPLOY_OKF_MEDIA_TYPE]: ["resource", "tool"],
  [QUICKDEPLOY_GIT_REPOSITORY_MEDIA_TYPE]: ["tool"],
  [ARD_CATALOG_MEDIA_TYPE]: [],
  [ARD_REGISTRY_MEDIA_TYPE]: [],
};

/** Lenient: unknown/provisional media type ⇒ [] (never throws). */
export function mediaTypeToCapabilityKinds(mediaType: string): readonly ArdCapabilityKind[] {
  return MEDIA_TYPE_TO_CAPABILITY_KINDS[normalizeArtifactMediaType(mediaType)] ?? [];
}

export const SOURCE_MEDIA_TYPE_TO_IMPORTER_ENGINE: Record<string, string> = {
  [OPENAPI_MEDIA_TYPE]: "openapi-2-mcp",
  [OPENAPI_YAML_MEDIA_TYPE]: "openapi-2-mcp",
  [ASYNCAPI_MEDIA_TYPE]: "asyncapi-2-mcp",
  [OPENRPC_MEDIA_TYPE]: "openrpc-2-mcp",
  [WSDL_MEDIA_TYPE]: "wsdl-2-mcp",
  [GRPC_PROTO_MEDIA_TYPE]: "grpc-2-mcp",
  [ARAZZO_MEDIA_TYPE]: "arazzo-2-mcp",
  [POSTMAN_COLLECTION_MEDIA_TYPE]: "postman-2-mcp",
  [HAR_MEDIA_TYPE]: "har-2-mcp",
  [CAPABILITY_TO_MEDIA_TYPE["agent-skill"]]: "agent-skills-2-mcp",
  [AI_SKILL_MD_MEDIA_TYPE]: "agent-skills-2-mcp",
  [RSS_FEED_MEDIA_TYPE]: "knowledge-2-mcp",
  [QUICKDEPLOY_OKF_MEDIA_TYPE]: "knowledge-2-mcp",
  [QUICKDEPLOY_GIT_REPOSITORY_MEDIA_TYPE]: "git-2-mcp",
};

/** Media type → artifact parser engine, or undefined when unmapped (provisional). */
export function sourceMediaTypeToImporterEngine(mediaType: string): string | undefined {
  return SOURCE_MEDIA_TYPE_TO_IMPORTER_ENGINE[normalizeArtifactMediaType(mediaType)];
}

export function defaultImportModeFor(mediaType: string): ArdImportMode {
  switch (normalizeArtifactMediaType(mediaType)) {
    case OPENAPI_MEDIA_TYPE:
    case OPENAPI_YAML_MEDIA_TYPE:
    case ASYNCAPI_MEDIA_TYPE:
    case OPENRPC_MEDIA_TYPE:
    case POSTMAN_COLLECTION_MEDIA_TYPE:
    case HAR_MEDIA_TYPE:
      return "operation-level";
    case JSON_RPC_MEDIA_TYPE:
    case WSDL_MEDIA_TYPE:
    case GRPC_PROTO_MEDIA_TYPE:
      return "method-level";
    case ACP_AGENT_MANIFEST_MEDIA_TYPE:
    case CAPABILITY_TO_MEDIA_TYPE["agent-skill"]:
    case AI_SKILL_MD_MEDIA_TYPE:
      return "skill-level";
    case ARAZZO_MEDIA_TYPE:
      return "workflow-level";
    default:
      return "whole-artifact";
  }
}

export interface DerivedCapabilityShape {
  kinds: ArdCapabilityKind[];
  engine?: string;
  isSource: boolean;
  unrecognizedHints: ArdCapabilityKind[];
}

export function deriveCapabilityKinds(
  entry: Pick<ArdEntry, "type" | "metadata">,
): DerivedCapabilityShape {
  const mediaType = normalizeArtifactMediaType(entry.type);
  const kinds = [...mediaTypeToCapabilityKinds(mediaType)];
  const authoritativeKinds = new Set(kinds);
  const hints = entry.metadata?.capabilityKinds ?? [];
  return {
    kinds,
    engine: sourceMediaTypeToImporterEngine(mediaType),
    isSource: isSourceArtifactMediaType(mediaType),
    unrecognizedHints: hints.filter((kind) => !authoritativeKinds.has(kind)),
  };
}

// ── URN helpers ──────────────────────────────────────────────────────────────

export interface AirUrnParts {
  domain: string;
  namespace: string;
  name: string;
}

export function buildAirUrn(parts: AirUrnParts): string {
  const domain = parts.domain.trim().toLowerCase();
  return `${AIR_URN_PREFIX}:${domain}:${parts.namespace}:${parts.name}`;
}

export function parseAirUrn(urn: string): AirUrnParts | null {
  const segments = urn.split(":");
  if (segments.length < 5) return null;
  const [scheme, air, domain, namespace, ...nameParts] = segments;
  if (scheme !== "urn" || air !== "air") return null;
  if (!domain || !namespace || nameParts.length === 0) return null;
  const name = nameParts.join(":");
  if (!name) return null;
  return { domain, namespace, name };
}

// ── Trust manifest ───────────────────────────────────────────────────────────

export type ArdIdentityType = "did" | "spiffe" | "https";

export interface ArdAttestation {
  type: string;
  capabilityKinds?: ArdCapabilityKind[] | null;
  status?: string;
  evidenceLevel?: number;
  summary?: string;
  uri?: string;
  reportRef?: string;
  completedAt?: string;
}

export interface ArdTrustManifest {
  identity: string;
  identityType: ArdIdentityType;
  attestations: ArdAttestation[];
  posture?: { decision?: string; status?: string };
}

export interface ArdHostIdentity {
  domain: string;
  identity?: string;
  identityType?: ArdIdentityType;
}

function resolveHostIdentity(host: ArdHostIdentity): {
  identity: string;
  identityType: ArdIdentityType;
} {
  if (host.identity) {
    const identityType =
      host.identityType ?? (host.identity.startsWith("spiffe://") ? "spiffe" : "did");
    return { identity: host.identity, identityType };
  }
  return { identity: `did:web:${host.domain}`, identityType: "did" };
}

export function minimalTrustManifest(host: ArdHostIdentity): ArdTrustManifest {
  const { identity, identityType } = resolveHostIdentity(host);
  return { identity, identityType, attestations: [] };
}

// Mirror of validation.ts categoryToEvidenceLevel + the passed-check labels.
type ValidationCategory =
  | "quality"
  | "security"
  | "evals"
  | "trust"
  | "content-safety"
  | "policy-gate";

const CATEGORY_EVIDENCE_LEVEL: Record<ValidationCategory, number | undefined> = {
  quality: undefined,
  security: 4,
  evals: 5,
  trust: undefined,
  "content-safety": undefined,
  "policy-gate": 6,
};

const CATEGORY_ATTESTATION_TYPE: Record<ValidationCategory, string> = {
  quality: "quality-reviewed",
  security: "static-scan",
  evals: "safe-test",
  trust: "identity-verified",
  "content-safety": "content-safe",
  "policy-gate": "policy-cleared",
};

const CATEGORY_PASSED_LABEL: Record<ValidationCategory, string> = {
  quality: "Quality reviewed",
  security: "Scanned",
  evals: "Safe-test passed",
  trust: "Identity verified",
  "content-safety": "Content-safe",
  "policy-gate": "Policy cleared",
};

export interface MirroredValidationRun {
  status?: string;
  decision?: string;
  capabilityKinds?: ArdCapabilityKind[] | null;
  results: Array<{
    category: ValidationCategory;
    capabilityKinds?: ArdCapabilityKind[] | null;
    status: string;
    reportRef?: string;
    completedAt?: string;
  }>;
}

/** Mirror of validationRunToTrustManifest — only passed checks emit claims. */
export function validationRunToTrustManifest(
  run: MirroredValidationRun,
  host: ArdHostIdentity,
): ArdTrustManifest {
  const { identity, identityType } = resolveHostIdentity(host);
  const attestations: ArdAttestation[] = [];
  for (const result of run.results) {
    if (result.status !== "passed") continue;
    attestations.push({
      type: CATEGORY_ATTESTATION_TYPE[result.category],
      capabilityKinds: result.capabilityKinds,
      status: "passed",
      evidenceLevel: CATEGORY_EVIDENCE_LEVEL[result.category],
      summary: CATEGORY_PASSED_LABEL[result.category],
      reportRef: result.reportRef,
      completedAt: result.completedAt,
    });
  }
  return {
    identity,
    identityType,
    attestations,
    posture: { decision: run.decision, status: run.status },
  };
}

// ── Wire types ───────────────────────────────────────────────────────────────

export interface ArdEntryMetadata {
  capabilityKinds?: ArdCapabilityKind[];
  importMode?: ArdImportMode;
  [key: string]: unknown;
}

export interface ArdEntry {
  identifier: string;
  displayName: string;
  type: string;
  url?: string;
  data?: unknown;
  description?: string;
  representativeQueries?: string[];
  tags?: string[];
  capabilities?: string[];
  version?: string;
  updatedAt?: string;
  trustManifest?: ArdTrustManifest;
  metadata?: ArdEntryMetadata;
}

export interface AiCatalogHost {
  displayName: string;
  identifier: string;
  documentationUrl?: string;
  logoUrl?: string;
  trustMetadata?: {
    catalogSigningKeys?: Array<{
      kid: string;
      alg: "ES256";
      publicJwk: JsonWebKey;
    }>;
    [key: string]: unknown;
  };
}

/**
 * The catalog root carries exactly `specVersion` + `host` + `entries`
 * (spec §4); sub-catalogs are entries typed `application/ai-catalog+json`.
 */
export interface AiCatalog {
  specVersion: string;
  host: AiCatalogHost;
  entries: ArdEntry[];
}

export type ArdFederationMode = "none" | "referrals" | "auto";

export interface ArdSearchRequest {
  query: { text: string; filter?: Record<string, string | string[]> };
  federation: ArdFederationMode;
  pageSize: number;
  pageToken?: string;
  visited?: string[];
}

export interface ArdSearchResult {
  identifier: string;
  displayName: string;
  type: string;
  url?: string;
  data?: unknown;
  description?: string;
  capabilities?: string[];
  score?: number;
  source?: string;
  tags?: string[];
  version?: string;
  updatedAt?: string;
  trustManifest?: ArdTrustManifest;
  metadata?: ArdEntryMetadata;
  sourceSignatureVerification?: {
    status: "not_checked" | "unsigned" | "verified" | "failed" | "unavailable";
    alg?: string;
    kid?: string;
    catalogUrl?: string;
  };
}

export interface ArdReferral {
  identifier?: string;
  displayName?: string;
  type: string;
  url: string;
}

export interface ArdSearchResponse {
  results: ArdSearchResult[];
  referrals: ArdReferral[];
  pageToken?: string;
}

// ── Filter helpers ───────────────────────────────────────────────────────────

export function normalizeFilterValues(value: string | string[]): string[] {
  return Array.isArray(value) ? value : [value];
}

export function filterTypesToCapabilities(
  filter: Record<string, string | string[]> | undefined,
): CapabilityType[] | null {
  if (!filter || filter.type === undefined) return null;
  const capabilities: CapabilityType[] = [];
  for (const mediaType of normalizeFilterValues(filter.type)) {
    const capability = mediaTypeToCapability(mediaType);
    if (capability && !capabilities.includes(capability)) {
      capabilities.push(capability);
    }
  }
  return capabilities;
}

/**
 * Does a record satisfy a structured filter? Values within one key are OR'd,
 * different keys are AND'd; the `type` key is matched by the caller (it selects
 * stores), so it is ignored here.
 */
export function matchesArdFilter(
  fields: Record<string, unknown>,
  filter: Record<string, string | string[]> | undefined,
): boolean {
  if (!filter) return true;
  for (const [key, rawValue] of Object.entries(filter)) {
    if (key === "type") continue;
    const wanted = normalizeFilterValues(rawValue);
    if (wanted.length === 0) continue;
    const actual = fields[key];
    const actualList = Array.isArray(actual)
      ? actual.map((v) => String(v))
      : actual === undefined || actual === null
        ? []
        : [String(actual)];
    if (!wanted.some((w) => actualList.includes(w))) return false;
  }
  return true;
}

// ── Request parsing ──────────────────────────────────────────────────────────

function clampPageSize(value: unknown): number {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : ARD_SEARCH_DEFAULT_PAGE_SIZE;
  if (!Number.isFinite(numeric) || numeric < ARD_SEARCH_MIN_PAGE_SIZE) {
    return ARD_SEARCH_DEFAULT_PAGE_SIZE;
  }
  return Math.min(Math.floor(numeric), ARD_SEARCH_MAX_PAGE_SIZE);
}

function normalizeFederation(value: unknown): ArdFederationMode {
  return value === "referrals" || value === "auto" ? value : "none";
}

function normalizeFilter(value: unknown): Record<string, string | string[]> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const out: Record<string, string | string[]> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === "string") {
      out[key] = raw;
    } else if (Array.isArray(raw)) {
      out[key] = raw.filter((v): v is string => typeof v === "string");
    }
  }
  return out;
}

export type ArdSearchParseResult =
  | { ok: true; request: ArdSearchRequest }
  | { ok: false; status: number; error: string };

/** Parse + normalize an ARD search request from an already-read JSON value. */
export function parseArdSearchRequest(raw: unknown): ArdSearchParseResult {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, status: 400, error: "Request body must be an object" };
  }
  const body = raw as Record<string, unknown>;
  const query = body.query;
  if (typeof query !== "object" || query === null || Array.isArray(query)) {
    return { ok: false, status: 400, error: "query is required" };
  }
  const text = (query as Record<string, unknown>).text;
  if (typeof text !== "string") {
    return { ok: false, status: 400, error: "query.text is required" };
  }
  const visited = Array.isArray(body.visited)
    ? body.visited.filter((v): v is string => typeof v === "string")
    : undefined;
  return {
    ok: true,
    request: {
      query: {
        text: text.trim().slice(0, ARD_SEARCH_MAX_QUERY_LENGTH),
        filter: normalizeFilter((query as Record<string, unknown>).filter),
      },
      federation: normalizeFederation(body.federation),
      pageSize: clampPageSize(body.pageSize),
      pageToken: typeof body.pageToken === "string" ? body.pageToken : undefined,
      visited,
    },
  };
}

// ── Pagination tokens ────────────────────────────────────────────────────────

/** Encode/decode an opaque offset page token (base64 of `{"o":N}`). */
export function encodePageToken(offset: number): string {
  return btoa(JSON.stringify({ o: offset }));
}

export function decodePageToken(token: string | undefined): number {
  if (!token) return 0;
  try {
    const parsed = JSON.parse(atob(token)) as { o?: unknown };
    const offset = typeof parsed.o === "number" ? parsed.o : 0;
    return offset >= 0 ? Math.floor(offset) : 0;
  } catch {
    return 0;
  }
}

// ── Result merge (existing-wins, mirrors mergeRegistryListings) ───────────────

/**
 * Merge external results into a local list. Local results always win on a urn
 * (identifier) collision; external results are appended and stamped with their
 * `source`. Mirrors the _shared/registry-listings-search.ts dedupe contract.
 */
export function mergeArdResults(
  local: ArdSearchResult[],
  external: ArdSearchResult[],
): ArdSearchResult[] {
  const seen = new Set(local.map((r) => dedupeKey(r)));
  const merged = [...local];
  for (const result of external) {
    const key = dedupeKey(result);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(result);
  }
  return merged;
}

function dedupeKey(result: ArdSearchResult): string {
  const id = result.identifier?.trim();
  if (id) return id.toLowerCase();
  return `${result.displayName}|${result.type}`.toLowerCase();
}
