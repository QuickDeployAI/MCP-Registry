import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  QUICKDEPLOY_REGISTRY_MANIFEST_META_KEY,
  McpManifestSchema,
  validateMcpManifestImporterConfig,
} from "@quickdeployai/registry-schemas";
import { compileManifestToServerJson } from "../src/registry-build";
import {
  GENERATED_MCP_POLICY_META_KEY,
  GENERATED_MCP_SOURCE_META_KEY,
  buildGeneratedMcpManifest,
  renderGeneratedMcpManifest,
  writeGeneratedMcpManifest,
  type GeneratedMcpManifestIntent,
} from "../src/codegen/manifest-generator";

const FIXTURE_INTENTS: GeneratedMcpManifestIntent[] = [
  {
    provider: "Acme OpenAPI",
    family: "openapi-2-mcp",
    source: {
      type: "http",
      uri: "https://api.example.test/openapi.json",
    },
    sourceMetadata: {
      retrievedAt: "2026-07-09",
      sourceVersion: "2026-07-01",
      notes: ["Fixture OpenAPI document for manifest generator tests."],
    },
    select: { requests: [{ method: "get", uriTemplate: "/widgets/{id}" }] },
    auth: [{ type: "bearer", valueFrom: { env: "ACME_OPENAPI_TOKEN" } }],
    config: {
      schema: { type: "object", properties: { baseUrl: { type: "string" } } },
      defaults: { baseUrl: "https://api.example.test" },
    },
    deployment: {
      userConfig: { baseUrl: { type: "string", description: "OpenAPI base URL." } },
      configSchema: { type: "object", properties: { baseUrl: { type: "string" } } },
    },
  },
  {
    provider: "Acme Events",
    family: "asyncapi-2-mcp",
    source: {
      type: "http",
      uri: "https://events.example.test/asyncapi.json",
    },
    sourceMetadata: { retrievedAt: "2026-07-09", sourceVersion: "1.2.0" },
    select: { requests: [{ method: "publish", uriTemplate: "channel://orders.created" }] },
    auth: [
      { type: "api-key", in: "header", name: "x-api-key", valueFrom: { env: "ACME_EVENTS_API_KEY" } },
    ],
    config: {
      schema: { type: "object", properties: { brokerProtocol: { type: "string" } } },
      defaults: { brokerProtocol: "kafka" },
    },
  },
  {
    provider: "Acme Greeter",
    family: "grpc-2-mcp",
    source: {
      type: "file",
      uri: "file://fixtures/acme-greeter.binpb",
    },
    sourceMetadata: { retrievedAt: "2026-07-09", sourceVersion: "sha256:test-descriptor" },
    select: { grpcMethods: [{ service: "acme.greeter.Greeter", method: "SayHello" }] },
    auth: [{ type: "bearer", valueFrom: { env: "ACME_GRPC_TOKEN" } }],
    config: {
      schema: {
        type: "object",
        required: ["endpoint"],
        properties: { endpoint: { type: "string" }, tls: { type: "boolean" } },
      },
      defaults: { tls: true },
    },
    deployment: {
      userConfig: { endpoint: { type: "string", description: "gRPC host:port endpoint." } },
      configSchema: {
        type: "object",
        required: ["endpoint"],
        properties: { endpoint: { type: "string" } },
      },
    },
  },
  {
    provider: "Acme SOAP",
    family: "wsdl-2-mcp",
    source: {
      type: "http",
      uri: "https://soap.example.test/service.wsdl",
    },
    sourceMetadata: { retrievedAt: "2026-07-09", sourceVersion: "service-v3" },
    select: { requests: [{ method: "soap", uriTemplate: "Calculator/Add" }] },
    auth: [
      {
        type: "basic",
        usernameFrom: { env: "ACME_SOAP_USERNAME" },
        passwordFrom: { env: "ACME_SOAP_PASSWORD" },
      },
    ],
    config: {
      schema: { type: "object", properties: { endpoint: { type: "string" } } },
      defaults: { endpoint: "https://soap.example.test/service" },
    },
  },
  {
    provider: "Acme Feed",
    family: "feed-2-mcp",
    source: {
      type: "http",
      uri: "https://feeds.example.test/releases.xml",
    },
    sourceMetadata: { retrievedAt: "2026-07-09", sourceVersion: "rss" },
    select: { corpusGlobs: ["/releases/**"] },
    auth: [],
    config: {
      schema: {
        type: "object",
        properties: {
          refreshMinutes: { type: "number" },
          maxItems: { type: "number" },
          includeContent: { type: "boolean" },
        },
      },
      defaults: { refreshMinutes: 15, maxItems: 50, includeContent: true },
    },
  },
];

describe("buildGeneratedMcpManifest", () => {
  it.each(FIXTURE_INTENTS)("generates a schema-valid $family manifest", (intent) => {
    const result = buildGeneratedMcpManifest(intent);
    const manifest = result.manifest;

    expect(() => McpManifestSchema.parse(manifest)).not.toThrow();
    expect(() => validateMcpManifestImporterConfig(manifest)).not.toThrow();
    expect(manifest.metadata.labels).toContain("generated");
    expect(manifest.metadata.labels).toContain(result.family);
    expect(manifest.spec.importer.versionRange).toBe("^0.1.0");
    expect(manifest.deployment.transport).toBe("streamable-http");
    expect(manifest.spec.config?.[GENERATED_MCP_SOURCE_META_KEY]).toMatchObject({
      uri: intent.source.uri,
      type: intent.source.type,
      retrievedAt: "2026-07-09",
    });
    expect(manifest.spec.config?.[GENERATED_MCP_POLICY_META_KEY]).toMatchObject({
      generatedExecution: "openshell-mxc-only",
      unavailableRuntime: "fail-closed",
    });
    expect(manifest._meta?.[GENERATED_MCP_SOURCE_META_KEY]).toEqual(
      manifest.spec.config?.[GENERATED_MCP_SOURCE_META_KEY],
    );
    expect(manifest._meta?.[GENERATED_MCP_POLICY_META_KEY]).toEqual(
      manifest.spec.config?.[GENERATED_MCP_POLICY_META_KEY],
    );

    const server = compileManifestToServerJson(manifest, result.manifestPath);
    expect(server.name).toBe(manifest.metadata.name);
    expect(server.packages?.[0]?.runtimeArguments).toContain(result.manifestPath);
    expect(server._meta?.[QUICKDEPLOY_REGISTRY_MANIFEST_META_KEY]).toEqual(manifest);
  });

  it("writes JSON to the deterministic committed manifest path", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "generated-mcp-manifest-"));
    const result = await writeGeneratedMcpManifest({
      rootDir,
      intent: FIXTURE_INTENTS[0],
    });

    expect(result.manifestPath).toBe("registry/acme-openapi/api.mcp.json");
    expect(result.path).toBe(join(rootDir, "registry", "acme-openapi", "api.mcp.json"));
    expect(JSON.parse(await readFile(result.path, "utf8"))).toEqual(result.manifest);
    expect(result.text).toBe(renderGeneratedMcpManifest(result.manifest));
  });

  it("rejects config defaults that look like literal secrets", () => {
    expect(() =>
      buildGeneratedMcpManifest({
        ...FIXTURE_INTENTS[0],
        config: {
          schema: { type: "object", properties: { apiKey: { type: "string" } } },
          defaults: { apiKey: "literal-secret" },
        },
      }),
    ).toThrow(/Use spec.auth env refs/);
  });

  it("uses deterministic capability defaults by family", () => {
    expect(buildGeneratedMcpManifest(FIXTURE_INTENTS[1]).manifestPath).toBe(
      "registry/acme-events/events.mcp.json",
    );
    expect(buildGeneratedMcpManifest(FIXTURE_INTENTS[2]).manifestPath).toBe(
      "registry/acme-greeter/proto.mcp.json",
    );
    expect(buildGeneratedMcpManifest(FIXTURE_INTENTS[3]).manifestPath).toBe(
      "registry/acme-soap/wsdl.mcp.json",
    );
    expect(buildGeneratedMcpManifest(FIXTURE_INTENTS[4]).manifestPath).toBe(
      "registry/acme-feed/feed.mcp.json",
    );
  });
});
