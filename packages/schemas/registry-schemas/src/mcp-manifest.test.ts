import { readFileSync } from "node:fs";
import type { AnySchema } from "ajv";
import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";
import {
  apiManifestDependencyAuthToMcpAuth,
  apiManifestToMcpManifestSelect,
  attachMcpManifestToServerJson,
  ApiManifestSchema,
  getImporterConfigSchema,
  MCP_MANIFEST_SCHEMA_ID,
  McpManifestSchema,
  OFFICIAL_MCP_SERVER_SCHEMA_2025_12_11,
  QUICKDEPLOY_MCP_MANIFEST_META_KEY,
  mcpManifestDeploymentAuthHeaders,
  selectOpenApiOperations,
  uriTemplatesMatch,
  validateMcpManifestImporterConfig,
} from "./mcp-manifest";

function example(name: string): unknown {
  return JSON.parse(
    readFileSync(new URL(`../examples/mcp-manifest/${name}.json`, import.meta.url), "utf8"),
  );
}

function publicSchema(): AnySchema {
  return JSON.parse(
    readFileSync(
      new URL("../../../../schemas/mcp-manifest.v1.schema.json", import.meta.url),
      "utf8",
    ),
  ) as AnySchema;
}

describe("McpManifestSchema", () => {
  it("publishes a JSON Schema that validates the canonical examples", () => {
    const schema = publicSchema();
    const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);

    expect(schema).toMatchObject({
      $id: MCP_MANIFEST_SCHEMA_ID,
      $schema: "https://json-schema.org/draft/2020-12/schema",
    });

    for (const name of ["openapi-select", "feed", "skills", "git-python"]) {
      const manifest = example(name);
      expect(validate(manifest), `${name}: ${JSON.stringify(validate.errors)}`).toBe(true);
      expect(() => McpManifestSchema.parse(manifest)).not.toThrow();
    }
  }, 30_000);

  it("vendors the API Manifest shape and converts requests to manifest select", () => {
    const apiManifest = ApiManifestSchema.parse(example("api-manifest-petstore"));
    const select = apiManifestToMcpManifestSelect(apiManifest);

    expect(apiManifest.apiDependencies.petstore?.apiDescriptionUrl).toBe(
      "https://petstore.example/openapi.json",
    );
    expect(select.requests).toEqual([
      { method: "GET", uriTemplate: "/pets/{petId}" },
      { method: "POST", uriTemplate: "/orders" },
    ]);
  });

  it("maps API Manifest authorization requirements to env-backed OAuth config", () => {
    const apiManifest = ApiManifestSchema.parse(example("api-manifest-petstore"));
    const dependency = apiManifest.apiDependencies.petstore;

    expect(dependency).toBeDefined();
    expect(apiManifestDependencyAuthToMcpAuth("petstore", dependency)).toEqual([
      {
        type: "oauth2",
        valueFrom: {
          env: "PETSTORE_OAUTH_TOKEN",
        },
      },
    ]);
  });

  it("validates the OpenAPI request subset example", () => {
    const manifest = McpManifestSchema.parse(example("openapi-select"));

    expect(manifest.metadata.name).toBe("ai.quickdeploy/github-search");
    expect(manifest.spec.select.requests).toEqual([
      { method: "GET", uriTemplate: "/search/issues" },
      { method: "POST", uriTemplate: "/repos/{owner}/{repo}/dispatches" },
    ]);
    expect(manifest.spec.auth[0]).toMatchObject({
      type: "bearer",
      valueFrom: { env: "GITHUB_TOKEN" },
    });
  });

  it("accepts top-level generation metadata", () => {
    const manifest = {
      ...(example("openapi-select") as Record<string, unknown>),
      _meta: {
        "ai.quickdeploy.registry/generatedMcp": {
          retrievedAt: "2026-07-09",
          source: "https://petstore.example/openapi.json",
        },
      },
    };
    const validate = new Ajv2020({ allErrors: true, strict: false }).compile(publicSchema());

    expect(validate(manifest), JSON.stringify(validate.errors)).toBe(true);
    expect(McpManifestSchema.parse(manifest)._meta).toMatchObject({
      "ai.quickdeploy.registry/generatedMcp": {
        retrievedAt: "2026-07-09",
      },
    });
  });

  it("validates placed upstream credential schemes without literal secrets", () => {
    const raw = example("openapi-select") as Record<string, any>;
    const manifest = {
      ...raw,
      spec: {
        ...raw.spec,
        auth: [
          {
            type: "api-key",
            in: "header",
            name: "x-api-key",
            valueFrom: { env: "PETSTORE_API_KEY" },
          },
          {
            type: "api-key",
            in: "query",
            name: "api_key",
            valueFrom: { env: "PETSTORE_QUERY_KEY" },
          },
          {
            type: "basic",
            usernameFrom: { env: "PETSTORE_USERNAME" },
            passwordFrom: { env: "PETSTORE_PASSWORD" },
          },
          {
            type: "oauth2",
            tokenUrl: "https://issuer.example.test/oauth/token",
            clientIdFrom: { env: "OAUTH_CLIENT_ID" },
            clientSecretFrom: { env: "OAUTH_CLIENT_SECRET" },
            scopes: ["pets:read", "pets:write"],
          },
        ],
      },
    };

    const validate = new Ajv2020({ allErrors: true, strict: false }).compile(publicSchema());
    expect(validate(manifest), JSON.stringify(validate.errors)).toBe(true);
    expect(McpManifestSchema.parse(manifest).spec.auth).toEqual(manifest.spec.auth);
    expect(JSON.stringify(manifest.spec.auth)).not.toContain("secret-value");
  });

  it("publishes importer config schemas for manifest-backed importers", () => {
    expect(getImporterConfigSchema("openapi-2-mcp")).toMatchObject({
      type: "object",
      properties: {
        baseUrl: { type: "string", format: "uri" },
      },
    });
    expect(getImporterConfigSchema("asyncapi-2-mcp")).toMatchObject({
      type: "object",
      properties: {
        brokerProtocol: { type: "string" },
        bootstrapServers: { type: "array" },
        schemaRegistryUrl: { type: "string", format: "uri" },
      },
    });
    expect(getImporterConfigSchema("openrpc-2-mcp")).toMatchObject({
      type: "object",
      properties: {
        endpoint: { type: "string", format: "uri" },
        transport: { type: "string" },
      },
      required: ["endpoint"],
    });
    expect(getImporterConfigSchema("feed-2-mcp")).toMatchObject({
      type: "object",
      properties: {
        refreshMinutes: { type: "number" },
      },
    });
    expect(getImporterConfigSchema("wsdl-2-mcp")).toMatchObject({
      type: "object",
      properties: {
        endpoint: { type: "string", format: "uri" },
        bindingName: { type: "string" },
        requestTimeoutMs: { type: "number" },
      },
    });
    expect(getImporterConfigSchema("postman-2-mcp")).toMatchObject({
      type: "object",
      properties: {
        baseUrl: { type: "string", format: "uri" },
        variables: { type: "object" },
        requestTimeoutMs: { type: "number" },
      },
    });
    expect(getImporterConfigSchema("har-2-mcp")).toMatchObject({
      type: "object",
      properties: {
        baseUrl: { type: "string", format: "uri" },
        includeMethods: { type: "array" },
      },
    });
    expect(getImporterConfigSchema("grpc-2-mcp")).toMatchObject({
      type: "object",
      properties: {
        endpoint: { type: "string" },
        protoPath: { type: "string" },
      },
    });
    expect(getImporterConfigSchema("arazzo-2-mcp")).toMatchObject({
      type: "object",
      properties: {
        sourceUrl: { type: "string", format: "uri" },
        resolveSourceDescriptions: { type: "boolean" },
      },
    });
  });

  it("validates manifest config defaults against the referenced importer schema", () => {
    const raw = example("openapi-select") as Record<string, any>;
    expect(() => validateMcpManifestImporterConfig(raw)).not.toThrow();

    expect(() =>
      validateMcpManifestImporterConfig({
        ...raw,
        spec: {
          ...raw.spec,
          config: {
            schema: {
              type: "object",
              properties: {
                unsupported: { type: "string" },
              },
            },
            defaults: {
              unsupported: "x",
            },
          },
        },
      }),
    ).toThrow(/openapi-2-mcp config field "unsupported"/);

    expect(() =>
      validateMcpManifestImporterConfig({
        ...raw,
        spec: {
          ...raw.spec,
          config: {
            schema: {
              type: "object",
              properties: {
                requestTimeoutMs: { type: "number" },
              },
            },
            defaults: {
              requestTimeoutMs: "slow",
            },
          },
        },
      }),
    ).toThrow(/openapi-2-mcp config field "requestTimeoutMs": expected number/);
  });

  it("validates hosted deployment auth modes", () => {
    const raw = example("openapi-select") as Record<string, any>;
    const manifest = McpManifestSchema.parse({
      ...raw,
      deployment: {
        ...raw.deployment,
        auth: {
          type: "bearer",
          tokenFrom: { env: "GITHUB_SEARCH_MCP_TOKEN" },
        },
      },
    });

    expect(manifest.deployment.auth).toEqual({
      type: "bearer",
      tokenFrom: { env: "GITHUB_SEARCH_MCP_TOKEN" },
    });
    expect(() =>
      McpManifestSchema.parse({
        ...raw,
        deployment: {
          ...raw.deployment,
          auth: {
            type: "bearer",
            tokenFrom: { env: "github-token" },
          },
        },
      }),
    ).toThrow(/environment variable names must be uppercase/);
  });

  it("validates the feed import example", () => {
    const manifest = McpManifestSchema.parse(example("feed"));

    expect(manifest.spec.source.type).toBe("http");
    expect(manifest.spec.select.corpusGlobs).toEqual(["/releases/**", "/blog/**"]);
    expect(manifest.deployment.transport).toBe("streamable-http");
  });

  it("validates OKF knowledge source manifests", () => {
    const manifest = McpManifestSchema.parse({
      apiVersion: "quickdeploy.ai/v1",
      kind: "McpManifest",
      metadata: {
        name: "ai.quickdeploy/knowledge-okf-example",
        version: "0.1.0",
      },
      spec: {
        importer: {
          engine: "knowledge-2-mcp",
          mode: "okf-2-mcp",
          versionRange: "^0.1.0",
        },
        source: {
          type: "git",
          uri: "git+https://github.com/example/generated-openwiki.git#main",
        },
        select: {
          knowledgeSources: [
            {
              id: "openwiki-output",
              kind: "okf",
              config: {
                bundleUri: "git+https://github.com/example/generated-openwiki.git#main",
                include: ["**/*.md"],
              },
            },
          ],
        },
        config: {
          chunking: { maxChars: 1200, overlap: 240 },
          embedding: { model: "text-embedding-3-small", dimensions: 1536 },
        },
        expose: {
          tools: [{ from: "knowledge.search", name: "knowledge_search" }],
        },
      },
      deployment: {
        transport: "streamable-http",
        auth: { type: "bearer" },
        refresh: {
          webhookPath: "/webhooks/knowledge-refresh",
          triggers: ["git-push"],
        },
      },
    });

    expect(manifest.spec.importer.mode).toBe("okf-2-mcp");
    expect(manifest.spec.select.knowledgeSources[0]?.kind).toBe("okf");
    expect(mcpManifestDeploymentAuthHeaders(manifest)).toEqual([
      {
        name: "Authorization",
        description: "Bearer token supplied by the MCP client.",
        required: true,
      },
    ]);
  });

  it("validates the Agent Skills import example", () => {
    const manifest = McpManifestSchema.parse(example("skills"));

    expect(manifest.spec.source.type).toBe("git");
    expect(manifest.spec.select.skills.map((skill) => skill.name)).toEqual([
      "agentic-eval",
      "playwright-cli",
    ]);
    expect(manifest.spec.expose.tools[1]).toMatchObject({
      from: "browser/install-extension",
      deny: true,
    });
  });

  it("validates git-2-mcp Python function selectors with immutable git pins", () => {
    const manifest = McpManifestSchema.parse(example("git-python"));

    expect(manifest.spec.source).toMatchObject({
      type: "git",
      uri: "git+https://github.com/QuickDeployAI/git-2-mcp-fixture.git@0123456789abcdef0123456789abcdef01234567",
    });
    expect(manifest.spec.select.pythonFunctions).toEqual([
      "qdai_git_fixture.add",
      "qdai_git_fixture.slugify",
    ]);
  });

  it("rejects git-2-mcp manifests with floating source refs", () => {
    const raw = example("git-python") as Record<string, any>;

    expect(() =>
      McpManifestSchema.parse({
        ...raw,
        spec: {
          ...raw.spec,
          source: {
            type: "git",
            uri: "git+https://github.com/QuickDeployAI/git-2-mcp-fixture.git",
            ref: "main",
          },
        },
      }),
    ).toThrow(/immutable commit SHA/);

    const validate = new Ajv2020({ allErrors: true, strict: false }).compile(publicSchema());
    expect(
      validate({
        ...raw,
        spec: {
          ...raw.spec,
          source: {
            type: "git",
            uri: "git+https://github.com/QuickDeployAI/git-2-mcp-fixture.git@main",
          },
        },
      }),
    ).toBe(false);
    expect(JSON.stringify(validate.errors)).toContain("uri");
  });

  it("embeds the full manifest under server.json _meta only", () => {
    const manifest = McpManifestSchema.parse({
      ...(example("openapi-select") as Record<string, any>),
      deployment: {
        ...((example("openapi-select") as Record<string, any>).deployment as Record<
          string,
          unknown
        >),
        auth: {
          type: "bearer",
          tokenFrom: { env: "GITHUB_SEARCH_MCP_TOKEN" },
        },
      },
    });
    const serverJson = attachMcpManifestToServerJson(
      {
        $schema: OFFICIAL_MCP_SERVER_SCHEMA_2025_12_11,
        name: manifest.metadata.name,
        description: "MCP tools generated from selected GitHub REST operations.",
        version: manifest.metadata.version,
        remotes: [
          {
            type: "streamable-http",
            url: "https://mcp.quickdeploy.ai/github-search/{tenant}",
            variables: {
              tenant: { description: "QuickDeploy tenant slug" },
            },
          },
        ],
      },
      manifest,
    );

    expect(serverJson._meta?.[QUICKDEPLOY_MCP_MANIFEST_META_KEY]).toEqual(manifest);
    expect((serverJson as any).remotes[0].headers).toContainEqual({
      name: "Authorization",
      description: "Bearer token sourced from GITHUB_SEARCH_MCP_TOKEN.",
      required: true,
      value: "Bearer ${GITHUB_SEARCH_MCP_TOKEN}",
    });
    expect(serverJson).not.toHaveProperty("quickdeployManifest");
    expect(serverJson).not.toHaveProperty("manifest");
  });

  it("projects OAuth deployment auth into client header placeholders", () => {
    const manifest = McpManifestSchema.parse({
      ...(example("openapi-select") as Record<string, any>),
      deployment: {
        ...((example("openapi-select") as Record<string, any>).deployment as Record<
          string,
          unknown
        >),
        auth: {
          type: "oauth2-resource",
          resourceMetadataUrl: "https://mcp.quickdeploy.ai/.well-known/oauth-protected-resource",
          audience: "https://mcp.quickdeploy.ai/github-search",
          requiredScopes: ["mcp:call"],
        },
      },
    });

    expect(mcpManifestDeploymentAuthHeaders(manifest)).toEqual([
      {
        name: "Authorization",
        description:
          "OAuth 2.1 access token for https://mcp.quickdeploy.ai/.well-known/oauth-protected-resource.",
        required: true,
        value: "Bearer ${MCP_ACCESS_TOKEN}",
      },
    ]);
  });

  it("defaults gateway deployment auth to the QuickDeploy assertion header", () => {
    const manifest = McpManifestSchema.parse({
      ...(example("feed") as Record<string, any>),
      deployment: {
        ...((example("feed") as Record<string, any>).deployment as Record<string, unknown>),
        auth: { type: "gateway" },
      },
    });

    expect(manifest.deployment.auth).toEqual({
      type: "gateway",
      authenticatedHeader: {
        name: "x-quickdeploy-gateway-authenticated",
        value: "true",
      },
    });
  });

  it("rejects ranges for published manifest versions", () => {
    const raw = example("openapi-select") as Record<string, unknown>;
    expect(() =>
      McpManifestSchema.parse({
        ...raw,
        metadata: {
          ...(raw.metadata as Record<string, unknown>),
          version: "^1.2.3",
        },
      }),
    ).toThrow(/exact semver/);
  });

  it("rejects invalid fixtures with useful schema errors", () => {
    const validate = new Ajv2020({ allErrors: true, strict: false }).compile(publicSchema());

    for (const [name, message] of [
      ["invalid-empty-select", "select"],
      ["invalid-secret-value", "valueFrom"],
    ] as const) {
      const manifest = example(name);
      expect(validate(manifest)).toBe(false);
      expect(JSON.stringify(validate.errors)).toContain(message);
      expect(() => McpManifestSchema.parse(manifest)).toThrow();
    }
  });

  it("matches URI templates by path parameter shape", () => {
    expect(uriTemplatesMatch("/pets/{petId}", "/pets/{id}")).toBe(true);
    expect(
      uriTemplatesMatch("https://petstore.example/v1/pets/{petId}?expand=owner", "/v1/pets/{id}"),
    ).toBe(true);
    expect(uriTemplatesMatch("/pets/{petId}", "/pets")).toBe(false);
    expect(uriTemplatesMatch("/pets/{petId}", "/pets/search")).toBe(false);
  });

  it("selects exactly two Petstore operations from a twenty-operation OpenAPI document", () => {
    const select = apiManifestToMcpManifestSelect(
      ApiManifestSchema.parse(example("api-manifest-petstore")),
    );
    const operations = selectOpenApiOperations(petstoreOpenApi(), select);

    expect(operations).toHaveLength(2);
    expect(operations.map((operation) => operation.operation.operationId)).toEqual([
      "getPetById",
      "createOrder",
    ]);
  });
});

function petstoreOpenApi() {
  const paths: Record<string, Record<string, { operationId: string }>> = {};

  for (let index = 0; index < 9; index += 1) {
    paths[`/catalog/${index}`] = {
      get: { operationId: `listCatalog${index}` },
      post: { operationId: `createCatalog${index}` },
    };
  }

  paths["/pets/{id}"] = {
    get: { operationId: "getPetById" },
  };
  paths["/orders"] = {
    post: { operationId: "createOrder" },
  };

  return {
    openapi: "3.1.0",
    info: {
      title: "Petstore",
      version: "1.0.0",
    },
    paths,
  };
}
