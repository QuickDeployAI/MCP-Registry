import { describe, expect, it } from "vitest";
import { CapabilityTypeSchema } from "./capability";
import {
  AiCatalogSchema,
  ArdCapabilityKindSchema,
  ArdEntrySchema,
  ArdSearchRequestSchema,
  ACP_AGENT_MANIFEST_MEDIA_TYPE,
  API_MANIFEST_MEDIA_TYPE,
  ARAZZO_MEDIA_TYPE,
  ARD_CATALOG_MEDIA_TYPE,
  ARD_REGISTRY_MEDIA_TYPE,
  ARD_SEARCH_DEFAULT_PAGE_SIZE,
  ASYNCAPI_MEDIA_TYPE,
  buildAirUrn,
  CAPABILITY_TO_MEDIA_TYPE,
  capabilityToMediaType,
  defaultImportModeFor,
  deriveCapabilityKinds,
  filterTypesToCapabilities,
  GRPC_PROTO_MEDIA_TYPE,
  QUICKDEPLOY_GIT_REPOSITORY_MEDIA_TYPE,
  RSS_FEED_MEDIA_TYPE,
  isSourceArtifactMediaType,
  JSON_RPC_MEDIA_TYPE,
  mediaTypeToCapability,
  mediaTypeToCapabilityKinds,
  minimalTrustManifest,
  normalizeArtifactMediaType,
  normalizeFilterValues,
  OPENAPI_MEDIA_TYPE,
  OPENRPC_MEDIA_TYPE,
  parseAirUrn,
  SOURCE_ARTIFACT_MEDIA_TYPES,
  sourceMediaTypeToImporterEngine,
  validationRunToTrustManifest,
} from "./ard";
import type { ValidationCheckResult, ValidationRun } from "./validation";

function result(
  partial: Partial<ValidationCheckResult> & Pick<ValidationCheckResult, "category">,
): ValidationCheckResult {
  return {
    checkId: "test",
    status: "passed",
    summary: "",
    findings: [],
    ...partial,
  };
}

function run(results: ValidationCheckResult[], extra: Partial<ValidationRun> = {}): ValidationRun {
  return {
    runId: "run_1",
    capabilityKey: "cap_1",
    version: "1.0.0",
    protocol: "mcp",
    source: "user-publish",
    status: "passed",
    results,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...extra,
  };
}

const HOST = { domain: "marketplace.quickdeploy.ai" } as const;

describe("capability ↔ media-type mapping", () => {
  it("round-trips every capability type", () => {
    for (const type of CapabilityTypeSchema.options) {
      const mediaType = capabilityToMediaType(type);
      expect(mediaType).toBeTruthy();
      expect(mediaTypeToCapability(mediaType)).toBe(type);
    }
  });

  it("uses spec-blessed media types for the three core protocols", () => {
    expect(CAPABILITY_TO_MEDIA_TYPE["agent-skill"]).toBe("application/ai-skill");
    expect(CAPABILITY_TO_MEDIA_TYPE.mcp).toBe("application/mcp-server-card+json");
    expect(CAPABILITY_TO_MEDIA_TYPE.a2a).toBe("application/a2a-agent-card+json");
  });

  it("is bijective (no two capability types share a media type)", () => {
    const mediaTypes = Object.values(CAPABILITY_TO_MEDIA_TYPE);
    expect(new Set(mediaTypes).size).toBe(mediaTypes.length);
  });

  it("returns null for an unknown media type", () => {
    expect(mediaTypeToCapability("application/unknown+json")).toBeNull();
  });
});

describe("URN helpers", () => {
  it("round-trips a urn:air identifier", () => {
    const urn = buildAirUrn({
      domain: "huggingface.co",
      namespace: "skill",
      name: "owner/remove-bg",
    });
    expect(urn).toBe("urn:air:huggingface.co:skill:owner/remove-bg");
    expect(parseAirUrn(urn)).toEqual({
      domain: "huggingface.co",
      namespace: "skill",
      name: "owner/remove-bg",
    });
  });

  it("lowercases the domain", () => {
    expect(buildAirUrn({ domain: "Acme.COM", namespace: "agent", name: "x" })).toBe(
      "urn:air:acme.com:agent:x",
    );
  });

  it("preserves a name containing colons", () => {
    const parsed = parseAirUrn("urn:air:acme.com:agent:team:bot");
    expect(parsed).toEqual({
      domain: "acme.com",
      namespace: "agent",
      name: "team:bot",
    });
  });

  it("rejects malformed urns", () => {
    expect(parseAirUrn("urn:air:acme.com:agent")).toBeNull();
    expect(parseAirUrn("urn:foo:acme.com:agent:x")).toBeNull();
    expect(parseAirUrn("not-a-urn")).toBeNull();
  });
});

describe("validationRunToTrustManifest", () => {
  it("emits an L4 static-scan attestation for a passed security check", () => {
    const manifest = validationRunToTrustManifest(
      run([result({ category: "security", status: "passed", capabilityKinds: ["tool"] })]),
      HOST,
    );
    expect(manifest.identity).toBe("did:web:marketplace.quickdeploy.ai");
    expect(manifest.identityType).toBe("did");
    const scan = manifest.attestations.find((a) => a.type === "static-scan");
    expect(scan).toBeDefined();
    expect(scan?.evidenceLevel).toBe(4);
    expect(scan?.capabilityKinds).toEqual(["tool"]);
  });

  it("surfaces a deny decision in posture", () => {
    const manifest = validationRunToTrustManifest(
      run([result({ category: "security", status: "failed" })], {
        status: "failed",
        decision: "deny",
      }),
      HOST,
    );
    expect(manifest.posture?.decision).toBe("deny");
    // A failed check must not produce an attestation.
    expect(manifest.attestations).toHaveLength(0);
  });

  it("honors an explicit SPIFFE identity", () => {
    const manifest = validationRunToTrustManifest(run([]), {
      domain: "acme.com",
      identity: "spiffe://acme.com/assistant",
    });
    expect(manifest.identityType).toBe("spiffe");
  });

  it("minimalTrustManifest yields host identity + empty attestations", () => {
    const manifest = minimalTrustManifest(HOST);
    expect(manifest.identity).toBe("did:web:marketplace.quickdeploy.ai");
    expect(manifest.attestations).toEqual([]);
  });
});

describe("schemas", () => {
  it("enforces url XOR data on catalog entries", () => {
    const base = {
      identifier: "urn:air:acme.com:mcp:x",
      displayName: "X",
      type: "application/mcp-server-card+json",
    };
    expect(ArdEntrySchema.safeParse({ ...base, url: "https://x" }).success).toBe(true);
    expect(ArdEntrySchema.safeParse({ ...base, data: { a: 1 } }).success).toBe(true);
    // neither
    expect(ArdEntrySchema.safeParse(base).success).toBe(false);
    // both
    expect(ArdEntrySchema.safeParse({ ...base, url: "https://x", data: {} }).success).toBe(false);
  });

  it("defaults federation and pageSize on a search request", () => {
    const parsed = ArdSearchRequestSchema.parse({ query: { text: "pdf" } });
    expect(parsed.federation).toBe("none");
    expect(parsed.pageSize).toBe(ARD_SEARCH_DEFAULT_PAGE_SIZE);
  });

  it("validates a full catalog document", () => {
    const catalog = {
      specVersion: "1.0",
      host: {
        displayName: "QuickDeployAI",
        identifier: "did:web:marketplace.quickdeploy.ai",
      },
      entries: [
        {
          identifier: "urn:air:marketplace.quickdeploy.ai:registry:global",
          displayName: "QuickDeployAI Registry",
          type: ARD_REGISTRY_MEDIA_TYPE,
          url: "https://marketplace.quickdeploy.ai/ard/search",
        },
      ],
    };
    expect(AiCatalogSchema.safeParse(catalog).success).toBe(true);
  });
});

describe("filter helpers", () => {
  it("normalizes scalar filter values to arrays", () => {
    expect(normalizeFilterValues("a")).toEqual(["a"]);
    expect(normalizeFilterValues(["a", "b"])).toEqual(["a", "b"]);
  });

  it("resolves filter.type media types to capability types", () => {
    expect(filterTypesToCapabilities({ type: "application/mcp-server-card+json" })).toEqual([
      "mcp",
    ]);
    expect(
      filterTypesToCapabilities({
        type: ["application/ai-skill", "application/unknown+json"],
      }),
    ).toEqual(["agent-skill"]);
  });

  it("returns null when no type filter is present", () => {
    expect(filterTypesToCapabilities(undefined)).toBeNull();
    expect(filterTypesToCapabilities({ tags: "finance" })).toBeNull();
  });
});

describe("source-definition artifacts + capability kinds", () => {
  it("derives capability kinds from source-artifact and protocol media types", () => {
    expect(mediaTypeToCapabilityKinds(OPENAPI_MEDIA_TYPE)).toEqual(["api-contract", "tool"]);
    expect(mediaTypeToCapabilityKinds(ASYNCAPI_MEDIA_TYPE)).toEqual([
      "api-contract",
      "event",
      "tool",
    ]);
    expect(mediaTypeToCapabilityKinds(ARAZZO_MEDIA_TYPE)).toEqual(["workflow"]);
    expect(mediaTypeToCapabilityKinds(CAPABILITY_TO_MEDIA_TYPE.mcp)).toEqual([
      "provider",
      "tool",
      "resource",
      "prompt",
      "task",
    ]);
    expect(mediaTypeToCapabilityKinds(CAPABILITY_TO_MEDIA_TYPE.a2a)).toEqual(["agent", "skill"]);
  });

  it("is lenient: unknown and structural media types yield no kinds", () => {
    expect(mediaTypeToCapabilityKinds("application/unknown+json")).toEqual([]);
    expect(mediaTypeToCapabilityKinds(ARD_CATALOG_MEDIA_TYPE)).toEqual([]);
  });

  it("only ever emits declared ArdCapabilityKind values", () => {
    const declared = new Set<string>(ArdCapabilityKindSchema.options);
    for (const mediaType of SOURCE_ARTIFACT_MEDIA_TYPES) {
      for (const kind of mediaTypeToCapabilityKinds(mediaType)) {
        expect(declared.has(kind)).toBe(true);
      }
    }
  });

  it("bridges source media types to their artifact-parser engine", () => {
    expect(sourceMediaTypeToImporterEngine(OPENAPI_MEDIA_TYPE)).toBe("openapi-2-mcp");
    expect(sourceMediaTypeToImporterEngine("Application/OpenAPI+JSON; charset=utf-8")).toBe(
      "openapi-2-mcp",
    );
    expect(sourceMediaTypeToImporterEngine(CAPABILITY_TO_MEDIA_TYPE["agent-skill"])).toBe(
      "agent-skills-2-mcp",
    );
    expect(sourceMediaTypeToImporterEngine(ARAZZO_MEDIA_TYPE)).toBe("arazzo-2-mcp");
    expect(sourceMediaTypeToImporterEngine(OPENRPC_MEDIA_TYPE)).toBe("openrpc-2-mcp");
    expect(sourceMediaTypeToImporterEngine(JSON_RPC_MEDIA_TYPE)).toBe("openrpc-2-mcp");
    expect(sourceMediaTypeToImporterEngine(RSS_FEED_MEDIA_TYPE)).toBe("feed-2-mcp");
    expect(sourceMediaTypeToImporterEngine(ACP_AGENT_MANIFEST_MEDIA_TYPE)).toBe(
      "acp-agent-manifest-2-mcp",
    );
    expect(sourceMediaTypeToImporterEngine(QUICKDEPLOY_GIT_REPOSITORY_MEDIA_TYPE)).toBe(
      "git-2-mcp",
    );
    expect(sourceMediaTypeToImporterEngine(API_MANIFEST_MEDIA_TYPE)).toBe("api-manifest-2-mcp");
  });

  it("defaults import modes by source artifact shape", () => {
    expect(defaultImportModeFor(OPENAPI_MEDIA_TYPE)).toBe("operation-level");
    expect(defaultImportModeFor("Application/OpenAPI+JSON; charset=utf-8")).toBe("operation-level");
    expect(defaultImportModeFor(GRPC_PROTO_MEDIA_TYPE)).toBe("method-level");
    expect(defaultImportModeFor(ACP_AGENT_MANIFEST_MEDIA_TYPE)).toBe("skill-level");
    expect(defaultImportModeFor(ARAZZO_MEDIA_TYPE)).toBe("workflow-level");
    expect(defaultImportModeFor(CAPABILITY_TO_MEDIA_TYPE.mcp)).toBe("whole-artifact");
    expect(defaultImportModeFor("application/unknown+json")).toBe("whole-artifact");
  });

  it("separates source-definition types from output-protocol types", () => {
    expect(isSourceArtifactMediaType(OPENAPI_MEDIA_TYPE)).toBe(true);
    expect(isSourceArtifactMediaType(ARD_CATALOG_MEDIA_TYPE)).toBe(true);
    // Output-protocol types stay out of the source set and keep round-tripping.
    expect(isSourceArtifactMediaType(CAPABILITY_TO_MEDIA_TYPE.mcp)).toBe(false);
    expect(mediaTypeToCapability(CAPABILITY_TO_MEDIA_TYPE.mcp)).toBe("mcp");
  });

  it("normalizes artifact media types leniently", () => {
    expect(normalizeArtifactMediaType(" Application/OpenAPI+JSON; charset=utf-8 ")).toBe(
      OPENAPI_MEDIA_TYPE,
    );
    expect(normalizeArtifactMediaType("text/yaml")).toBe("application/vnd.oai.openapi+yaml");
    expect(normalizeArtifactMediaType("application/unknown+json;v=1")).toBe(
      "application/unknown+json",
    );
    expect(mediaTypeToCapabilityKinds("Application/OpenAPI+JSON; charset=utf-8")).toEqual([
      "api-contract",
      "tool",
    ]);
  });

  it("accepts an entry that carries source metadata (capabilityKinds, importMode)", () => {
    const entry = {
      identifier: "urn:air:acme.com:api:payments",
      displayName: "Payments API",
      type: OPENAPI_MEDIA_TYPE,
      url: "https://api.acme.com/openapi.json",
      metadata: { capabilityKinds: ["api-contract", "tool"], importMode: "operation-level" },
    };
    expect(ArdEntrySchema.safeParse(entry).success).toBe(true);
  });

  it("rejects unknown importMode metadata values", () => {
    const entry = {
      identifier: "urn:air:acme.com:api:payments",
      displayName: "Payments API",
      type: OPENAPI_MEDIA_TYPE,
      url: "https://api.acme.com/openapi.json",
      metadata: { importMode: "freeform-mode" },
    };
    expect(ArdEntrySchema.safeParse(entry).success).toBe(false);
  });

  it("derives an authoritative capability shape for OpenAPI source entries", () => {
    expect(
      deriveCapabilityKinds({
        type: OPENAPI_MEDIA_TYPE,
        metadata: { capabilityKinds: ["api-contract", "tool"] },
      }),
    ).toEqual({
      kinds: ["api-contract", "tool"],
      engine: "openapi-2-mcp",
      isSource: true,
      unrecognizedHints: [],
    });
  });

  it("derives native protocol shapes without importer engines", () => {
    expect(deriveCapabilityKinds({ type: CAPABILITY_TO_MEDIA_TYPE.mcp })).toEqual({
      kinds: ["provider", "tool", "resource", "prompt", "task"],
      engine: undefined,
      isSource: false,
      unrecognizedHints: [],
    });
  });

  it("surfaces publisher hints that are not authoritative for the media type", () => {
    expect(
      deriveCapabilityKinds({
        type: OPENAPI_MEDIA_TYPE,
        metadata: { capabilityKinds: ["api-contract", "tool", "prompt"] },
      }),
    ).toEqual({
      kinds: ["api-contract", "tool"],
      engine: "openapi-2-mcp",
      isSource: true,
      unrecognizedHints: ["prompt"],
    });
  });

  it("is lenient for unknown capability-shape media types", () => {
    expect(deriveCapabilityKinds({ type: "application/unknown+json" })).toEqual({
      kinds: [],
      engine: undefined,
      isSource: false,
      unrecognizedHints: [],
    });
  });
});
