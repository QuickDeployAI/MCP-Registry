import { z } from "zod";
import { CapabilityTypeSchema, type CapabilityType } from "./capability.js";
import {
  badgeLabel,
  categoryToEvidenceLevel,
  ValidationDecisionSchema,
  ValidationStatusSchema,
  type ValidationCheckCategory,
  type ValidationRun,
} from "./validation.js";

/**
 * Agentic Resource Discovery (ARD) — shared contracts + pure mapping.
 *
 * ARD (the Hugging Face / Microsoft / Google draft spec) is a *discovery* layer:
 * a static `GET /.well-known/ai-catalog.json` manifest plus a dynamic
 * `POST /search` registry API with cross-registry federation. ARD only handles
 * discovery — a client invokes the resource it finds through that resource's own
 * protocol (MCP, A2A, …), so this module never touches invocation.
 *
 * This is the single source of truth for the ARD wire shapes and the pure
 * mappings between our internal capability taxonomy (./capability) + validation
 * evidence (./validation) and the ARD spec. It is runtime-agnostic (no I/O) so
 * the same code runs in the marketplace browser bundle, in Node, and in the Deno
 * edge functions (ard-catalog, ard-search, ard-federation) without duplication.
 *
 * See apps/quick-deploy-marketplace/supabase/functions/ard-catalog +
 * ard-search + _shared/ard-federation.ts for the server/client surfaces.
 */

// ── Constants ────────────────────────────────────────────────────────────────

export const ARD_SPEC_VERSION = "1.0";

/** IANA-style media type for a registry-pointer (referral) entry. */
export const ARD_REGISTRY_MEDIA_TYPE = "application/ai-registry+json";

/** URN scheme ARD uses to domain-anchor every resource identifier. */
export const AIR_URN_PREFIX = "urn:air";

// ── Capability ↔ media-type mapping ──────────────────────────────────────────

/**
 * Capability type → ARD media type. The three spec-blessed protocols use their
 * canonical IANA-style types; everything else uses the QuickDeployAI vendor tree
 * so every internal capability type is representable and the inverse map is
 * bijective (clean round-trips). Declared as `Record<CapabilityType, …>` so a
 * newly added capability type fails the exhaustiveness check until it is mapped.
 */
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

/** Inverse of {@link CAPABILITY_TO_MEDIA_TYPE}, built bijectively. */
export const MEDIA_TYPE_TO_CAPABILITY: Record<string, CapabilityType> = Object.fromEntries(
  (Object.entries(CAPABILITY_TO_MEDIA_TYPE) as [CapabilityType, string][]).map(
    ([capability, mediaType]) => [mediaType, capability],
  ),
);

/** Map an internal capability type to its ARD media type. */
export function capabilityToMediaType(type: CapabilityType): string {
  return CAPABILITY_TO_MEDIA_TYPE[type];
}

/** Map an ARD media type back to an internal capability type, or null. */
export function mediaTypeToCapability(mediaType: string): CapabilityType | null {
  return MEDIA_TYPE_TO_CAPABILITY[mediaType] ?? null;
}

// ── Source-definition artifacts ↔ capability kinds ───────────────────────────

/**
 * Internal "capability kind" taxonomy — the artifact *facets* the registry derives
 * from an ARD entry's media {@link ArdEntry.type}, for search / policy / routing.
 *
 * A capability **kind** is distinct from a capability {@link CapabilityType}: a type
 * is the resource's own protocol (mcp, a2a, …); a kind is a facet the source artifact
 * decomposes into — an OpenAPI contract yields `api-contract` + one `tool` per
 * operation; an MCP server yields a `provider` plus introspected `tool`/`resource`/
 * `prompt`/`task`. Kinds are derived server-side and never authoritative on the wire.
 * (`capabilityType` fields hold a CapabilityType protocol value, not one of these;
 * see docs/architecture/ard-compatibility-profile.md.)
 */
export const ArdCapabilityKindSchema = z.enum([
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
]);
export type ArdCapabilityKind = z.infer<typeof ArdCapabilityKindSchema>;

export const ArdImportModeSchema = z.enum([
  "whole-artifact",
  "operation-level",
  "method-level",
  "skill-level",
  "workflow-level",
]);
export type ArdImportMode = z.infer<typeof ArdImportModeSchema>;

/** Media type for a nested ARD catalog document (a sub-catalog entry — recurse). */
export const ARD_CATALOG_MEDIA_TYPE = "application/ai-catalog+json";

// Source-definition artifact media types the registry recognizes *beyond* the 13
// output-protocol types in CAPABILITY_TO_MEDIA_TYPE. Several are provisional aliases
// pending IANA registration, so intermediaries stay lenient (unknown ⇒ accepted).
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

/**
 * Source-definition + structural media types recognized in addition to the 13
 * output-protocol types. {@link isSourceArtifactMediaType} uses this to tell a
 * "source artifact" entry (whose native document an importer parses) apart from an
 * already-runnable protocol type.
 */
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
]);

/** Is this a source-definition/structural artifact type (vs. an output-protocol type)? */
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

/**
 * Media type → internal capability kinds — the ARD Compatibility Profile dispatch
 * table. Output-protocol keys reuse CAPABILITY_TO_MEDIA_TYPE so the two tables can
 * never disagree. Structural types map to `[]` (they recurse / federate; they do not
 * decompose into kinds).
 */
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

/**
 * Derive the internal capability kinds an ARD media type decomposes into. Lenient:
 * an unrecognized / provisional media type yields `[]` (never throws), so a publisher
 * can advertise a type we do not model yet without breaking discovery.
 */
export function mediaTypeToCapabilityKinds(mediaType: string): readonly ArdCapabilityKind[] {
  return MEDIA_TYPE_TO_CAPABILITY_KINDS[normalizeArtifactMediaType(mediaType)] ?? [];
}

/**
 * Bridge a source-definition media type to the `x-2-mcp` importer engine that parses
 * it (see packages/importers/*). Returns `undefined` when no importer exists yet,
 * mirroring getImporterConfigSchema()'s `| undefined` convention.
 */
export const SOURCE_MEDIA_TYPE_TO_IMPORTER_ENGINE: Record<string, string> = {
  [OPENAPI_MEDIA_TYPE]: "openapi-2-mcp",
  [OPENAPI_YAML_MEDIA_TYPE]: "openapi-2-mcp",
  [ASYNCAPI_MEDIA_TYPE]: "asyncapi-2-mcp",
  [OPENRPC_MEDIA_TYPE]: "openrpc-2-mcp",
  [JSON_RPC_MEDIA_TYPE]: "openrpc-2-mcp",
  [WSDL_MEDIA_TYPE]: "wsdl-2-mcp",
  [GRPC_PROTO_MEDIA_TYPE]: "grpc-2-mcp",
  [ARAZZO_MEDIA_TYPE]: "arazzo-2-mcp",
  [POSTMAN_COLLECTION_MEDIA_TYPE]: "postman-2-mcp",
  [HAR_MEDIA_TYPE]: "har-2-mcp",
  [ACP_AGENT_MANIFEST_MEDIA_TYPE]: "acp-agent-manifest-2-mcp",
  [CAPABILITY_TO_MEDIA_TYPE["agent-skill"]]: "agent-skills-2-mcp",
  [AI_SKILL_MD_MEDIA_TYPE]: "agent-skills-2-mcp",
  [RSS_FEED_MEDIA_TYPE]: "feed-2-mcp",
  [QUICKDEPLOY_OKF_MEDIA_TYPE]: "knowledge-2-mcp",
  [QUICKDEPLOY_GIT_REPOSITORY_MEDIA_TYPE]: "git-2-mcp",
};

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
  /** Authoritative kinds derived from entry.type. */
  kinds: ArdCapabilityKind[];
  /** Parser engine for the source artifact, or undefined for native/unmapped types. */
  engine?: string;
  /** True when entry.type is a source-definition/structural type. */
  isSource: boolean;
  /** Publisher-hinted kinds that are not in the authoritative set. */
  unrecognizedHints: ArdCapabilityKind[];
}

export function deriveCapabilityKinds(
  entry: Pick<ArdEntry, "type" | "metadata">,
): DerivedCapabilityShape {
  const mediaType = normalizeArtifactMediaType(entry.type);
  const kinds = [...mediaTypeToCapabilityKinds(mediaType)];
  const authoritativeKinds = new Set(kinds);
  const hints = entry.metadata?.capabilityKinds ?? [];
  const engine = sourceMediaTypeToImporterEngine(mediaType);
  return {
    kinds,
    ...(engine ? { engine } : {}),
    isSource: isSourceArtifactMediaType(mediaType),
    unrecognizedHints: hints.filter((kind) => !authoritativeKinds.has(kind)),
  };
}

// ── URN helpers ──────────────────────────────────────────────────────────────

export interface AirUrnParts {
  /** Publisher domain the identifier anchors trust to, e.g. "huggingface.co". */
  domain: string;
  /** Resource namespace, e.g. "mcp", "agent", "skill". */
  namespace: string;
  /** Resource name; may itself contain ":" (e.g. "owner/name"). */
  name: string;
}

/** Build a domain-anchored ARD identifier: `urn:air:<domain>:<ns>:<name>`. */
export function buildAirUrn(parts: AirUrnParts): string {
  const domain = parts.domain.trim().toLowerCase();
  return `${AIR_URN_PREFIX}:${domain}:${parts.namespace}:${parts.name}`;
}

/** Parse an `urn:air:<domain>:<ns>:<name>` identifier, or null when malformed. */
export function parseAirUrn(urn: string): AirUrnParts | null {
  const segments = urn.split(":");
  // ["urn", "air", domain, namespace, ...nameParts]
  if (segments.length < 5) return null;
  const [scheme, air, domain, namespace, ...nameParts] = segments;
  if (scheme !== "urn" || air !== "air") return null;
  if (!domain || !namespace || nameParts.length === 0) return null;
  const name = nameParts.join(":");
  if (!name) return null;
  return { domain, namespace, name };
}

// ── Trust manifest ───────────────────────────────────────────────────────────

export const ArdIdentityTypeSchema = z.enum(["did", "spiffe", "https"]);
export type ArdIdentityType = z.infer<typeof ArdIdentityTypeSchema>;

export const ArdAttestationSchema = z.object({
  /** Attestation kind, e.g. "static-scan", "safe-test", "policy-cleared". */
  type: z.string(),
  /** Derived capability kinds this attestation covers; omitted means whole-capability. */
  capabilityKinds: z.array(ArdCapabilityKindSchema).nullable().optional(),
  status: z.string().optional(),
  /** Trust-passport evidence-ladder rung this attestation lights (1..8). */
  evidenceLevel: z.number().int().min(1).max(8).optional(),
  summary: z.string().optional(),
  /** External compliance document link (SOC2/ISO/etc.). */
  uri: z.string().optional(),
  /** Provider-native (SARIF) report reference for CI + audit. */
  reportRef: z.string().optional(),
  completedAt: z.string().optional(),
});
export type ArdAttestation = z.infer<typeof ArdAttestationSchema>;

export const ArdTrustManifestSchema = z.object({
  /** Workload identity (SPIFFE id, DID, or HTTPS domain). */
  identity: z.string(),
  identityType: ArdIdentityTypeSchema,
  attestations: z.array(ArdAttestationSchema).default([]),
  /** QuickDeployAI extension: the publish-time policy posture, when known. */
  posture: z
    .object({
      decision: ValidationDecisionSchema.optional(),
      status: ValidationStatusSchema.optional(),
    })
    .optional(),
});
export type ArdTrustManifest = z.infer<typeof ArdTrustManifestSchema>;

/** Which attestation `type` each validation category emits when it passes. */
const CATEGORY_ATTESTATION_TYPE: Record<ValidationCheckCategory, string> = {
  quality: "quality-reviewed",
  security: "static-scan",
  evals: "safe-test",
  trust: "identity-verified",
  "content-safety": "content-safe",
  "policy-gate": "policy-cleared",
};

export interface ArdHostIdentity {
  /** Publisher domain, e.g. "marketplace.quickdeploy.ai". */
  domain: string;
  /** Explicit workload identity; defaults to `did:web:<domain>`. */
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

/**
 * A minimal, honest trust manifest for a capability with no validation evidence:
 * the host identity and an empty attestations list (no claims fabricated).
 */
export function minimalTrustManifest(host: ArdHostIdentity): ArdTrustManifest {
  const { identity, identityType } = resolveHostIdentity(host);
  return { identity, identityType, attestations: [] };
}

/**
 * Derive an ARD trust manifest from a capability's validation run. Each *passed*
 * check becomes an attestation carrying the evidence-ladder rung it owns
 * (security→L4, evals→L5, policy-gate→L6); the run's policy decision + aggregate
 * status are surfaced as posture so ARD clients can filter on attestation type
 * and gate on the decision. Trust claims are never invented — only passed checks
 * emit attestations.
 */
export function validationRunToTrustManifest(
  run: ValidationRun,
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
      evidenceLevel: categoryToEvidenceLevel(result.category),
      summary: badgeLabel(result.category, result.status),
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

// ── ai-catalog.json (static manifest) ────────────────────────────────────────

export const AiCatalogHostSchema = z.object({
  displayName: z.string(),
  /** Host workload identity, e.g. "did:web:marketplace.quickdeploy.ai". */
  identifier: z.string(),
  documentationUrl: z.string().optional(),
  logoUrl: z.string().optional(),
  trustMetadata: z
    .object({
      catalogSigningKeys: z
        .array(
          z.object({
            kid: z.string(),
            alg: z.literal("ES256"),
            publicJwk: z.record(z.string(), z.unknown()),
          }),
        )
        .optional(),
    })
    .catchall(z.unknown())
    .optional(),
});
export type AiCatalogHost = z.infer<typeof AiCatalogHostSchema>;

/**
 * ARD allows publishers to attach custom entry metadata; these are the registry's
 * *recognized* keys. `capabilityKinds` is an optional publisher hint — the registry
 * still derives kinds from `type` as the authority (see {@link mediaTypeToCapabilityKinds});
 * `importMode` hints how the native artifact is decomposed (e.g. "operation-level").
 * Detailed selection/curation/deployment is NOT carried here — that is internal
 * projection config, never a public source manifest. Unknown keys pass through
 * (`.catchall`), matching the ARD spec's open metadata.
 */
export const ArdEntryMetadataSchema = z
  .object({
    capabilityKinds: z.array(ArdCapabilityKindSchema).optional(),
    importMode: ArdImportModeSchema.optional(),
  })
  .catchall(z.unknown());
export type ArdEntryMetadata = z.infer<typeof ArdEntryMetadataSchema>;

const ArdEntryFields = {
  /** Domain-anchored `urn:air:…` identifier (or `application/ai-registry+json` pointer). */
  identifier: z.string(),
  displayName: z.string(),
  /** ARD media type (see CAPABILITY_TO_MEDIA_TYPE / ARD_REGISTRY_MEDIA_TYPE). */
  type: z.string(),
  description: z.string().optional(),
  /** Natural-language queries the publisher expects this resource to match. */
  representativeQueries: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  capabilities: z.array(z.string()).optional(),
  version: z.string().optional(),
  updatedAt: z.string().optional(),
  trustManifest: ArdTrustManifestSchema.optional(),
  /** Open, publisher-supplied registry hints (`capabilityKinds`, `importMode`, …). */
  metadata: ArdEntryMetadataSchema.optional(),
};

/** A catalog entry carries exactly one of `url` (reference) or `data` (inline). */
export const ArdEntrySchema = z
  .object({
    ...ArdEntryFields,
    url: z.string().optional(),
    data: z.unknown().optional(),
  })
  .refine((entry) => (entry.url === undefined) !== (entry.data === undefined), {
    message: "An ARD entry must carry exactly one of `url` or `data`.",
  });
export type ArdEntry = z.infer<typeof ArdEntrySchema>;

/**
 * The ARD catalog document root carries exactly `specVersion` + `host` +
 * `entries` (spec §4). Sub-catalogs are advertised as entries typed
 * `application/ai-catalog+json` (url or inline data), not a root member.
 */
export const AiCatalogSchema = z.object({
  specVersion: z.string().default(ARD_SPEC_VERSION),
  host: AiCatalogHostSchema,
  entries: z.array(ArdEntrySchema).default([]),
});
export type AiCatalog = z.infer<typeof AiCatalogSchema>;

// ── POST /search ─────────────────────────────────────────────────────────────

export const ArdFederationModeSchema = z.enum(["none", "referrals", "auto"]);
export type ArdFederationMode = z.infer<typeof ArdFederationModeSchema>;

export const ARD_SEARCH_MIN_PAGE_SIZE = 1;
export const ARD_SEARCH_MAX_PAGE_SIZE = 100;
export const ARD_SEARCH_DEFAULT_PAGE_SIZE = 10;

/**
 * Structured filter: dot-path keys, scalar values treated as single-item arrays.
 * Values within one key are OR'd; different keys are AND'd (matched post-search).
 */
export const ArdSearchFilterSchema = z.record(
  z.string(),
  z.union([z.string(), z.array(z.string())]),
);
export type ArdSearchFilter = z.infer<typeof ArdSearchFilterSchema>;

export const ArdSearchQuerySchema = z.object({
  text: z.string(),
  filter: ArdSearchFilterSchema.optional(),
});
export type ArdSearchQuery = z.infer<typeof ArdSearchQuerySchema>;

export const ArdSearchRequestSchema = z.object({
  query: ArdSearchQuerySchema,
  federation: ArdFederationModeSchema.default("none"),
  pageSize: z
    .number()
    .int()
    .min(ARD_SEARCH_MIN_PAGE_SIZE)
    .max(ARD_SEARCH_MAX_PAGE_SIZE)
    .default(ARD_SEARCH_DEFAULT_PAGE_SIZE),
  pageToken: z.string().optional(),
  /**
   * QuickDeployAI extension: registry identifiers already visited on this
   * federation walk, propagated so a downstream registry doesn't re-walk us.
   */
  visited: z.array(z.string()).optional(),
});
export type ArdSearchRequest = z.infer<typeof ArdSearchRequestSchema>;

export const ArdSearchResultSchema = z.object({
  identifier: z.string(),
  displayName: z.string(),
  type: z.string(),
  url: z.string().optional(),
  data: z.unknown().optional(),
  description: z.string().optional(),
  capabilities: z.array(z.string()).optional(),
  /** Relevance ranking 0..100 — informational only, not a trust rating. */
  score: z.number().min(0).max(100).optional(),
  /** Which registry returned this entry (powers the marketplace source badge). */
  source: z.string().optional(),
  tags: z.array(z.string()).optional(),
  version: z.string().optional(),
  updatedAt: z.string().optional(),
  trustManifest: ArdTrustManifestSchema.optional(),
  metadata: ArdEntryMetadataSchema.optional(),
  sourceSignatureVerification: z
    .object({
      status: z.enum(["not_checked", "unsigned", "verified", "failed", "unavailable"]),
      alg: z.string().optional(),
      kid: z.string().optional(),
      catalogUrl: z.string().optional(),
    })
    .optional(),
});
export type ArdSearchResult = z.infer<typeof ArdSearchResultSchema>;

export const ArdReferralSchema = z.object({
  identifier: z.string().optional(),
  displayName: z.string().optional(),
  type: z.string().default(ARD_REGISTRY_MEDIA_TYPE),
  url: z.string(),
});
export type ArdReferral = z.infer<typeof ArdReferralSchema>;

export const ArdSearchResponseSchema = z.object({
  results: z.array(ArdSearchResultSchema).default([]),
  referrals: z.array(ArdReferralSchema).default([]),
  pageToken: z.string().optional(),
});
export type ArdSearchResponse = z.infer<typeof ArdSearchResponseSchema>;

// ── Filter helpers ───────────────────────────────────────────────────────────

/** Normalize a filter value (scalar or array) to an array, per the spec. */
export function normalizeFilterValues(value: string | string[]): string[] {
  return Array.isArray(value) ? value : [value];
}

/**
 * Resolve the capability types a search request targets from its
 * `query.filter.type` media types. Returns null when no type filter is present
 * (caller should search all stores). Unknown media types are dropped.
 */
export function filterTypesToCapabilities(
  filter: ArdSearchFilter | undefined,
): CapabilityType[] | null {
  if (!filter || filter.type === undefined) return null;
  const mediaTypes = normalizeFilterValues(filter.type);
  const capabilities: CapabilityType[] = [];
  for (const mediaType of mediaTypes) {
    const capability = mediaTypeToCapability(mediaType);
    if (capability && !capabilities.includes(capability)) {
      capabilities.push(capability);
    }
  }
  return capabilities;
}
