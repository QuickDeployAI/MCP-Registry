import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp } from "node:fs/promises";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import {
  McpManifestSchema,
  QUICKDEPLOY_ARD_ENTRY_META_KEY,
  QUICKDEPLOY_MCP_PROJECTION_META_KEY,
  QUICKDEPLOY_REGISTRY_MANIFEST_META_KEY,
} from "@quickdeployai/registry-schemas";
import {
  buildRegistryArtifacts,
  checkGeneratedRegistryArtifacts,
  compileBakedManifestToServerJson,
  compileManifestToServerJson,
  extractManifestFromServerJson,
  writeRegistryArtifacts,
} from "../src/registry-build";

const execFileAsync = promisify(execFile);
const REGISTRY_BUILD_TEST_TIMEOUT_MS = 30_000;

describe("registry build artifacts", () => {
  it(
    "generates canonical servers.json entries",
    async () => {
      const rootDir = await fixtureRoot();
      await seedIgnoredPackageServer(rootDir);
      await seedRemote(rootDir);
      await seedArdProjection(rootDir);

      const artifacts = await buildRegistryArtifacts({ rootDir });
      expect(artifacts.serversJson.servers.map((server) => server.name)).toEqual([
        "ai.quickdeploy/petstore",
        "com.linear/mcp",
      ]);

      expect(artifacts.files).toEqual({
        "servers.json": expect.any(String),
      });
      expect(artifacts.generatedFiles).toEqual({
        "registry/index.json": expect.any(String),
      });
      expect(artifacts.indexJson.providers).toEqual([
        {
          id: "linear",
          entries: [
            {
              kind: "server-json",
              name: "com.linear/mcp",
              path: "registry/linear/mcp.server.json",
              version: "1.0.0",
            },
          ],
        },
        {
          id: "quickdeploy",
          entries: [
            {
              kind: "ard-projection",
              name: "ai.quickdeploy/petstore",
              path: "registry/quickdeploy/petstore.ard.json",
              version: "1.0.0",
            },
          ],
        },
      ]);
      expect(artifacts.serversJson.servers).toContainEqual(
        expect.objectContaining({
          name: "com.linear/mcp",
          remotes: [{ type: "streamable-http", url: "https://mcp.linear.app/mcp" }],
        }),
      );
      expect(artifacts.serversJson.servers).toContainEqual(
        expect.objectContaining({
          name: "ai.quickdeploy/petstore",
          packages: [
            expect.objectContaining({
              identifier: "ghcr.io/quickdeployai/mcp-host",
              runtimeArguments: [
                "run",
                "registry/quickdeploy/petstore.ard.json",
                "--projection",
                "registry/quickdeploy/petstore.projection.json",
                "--transport",
                "streamable-http",
              ],
            }),
          ],
        }),
      );
      const petstore = artifacts.serversJson.servers.find(
        (server) => server.name === "ai.quickdeploy/petstore",
      );
      expect(petstore?._meta).not.toHaveProperty(QUICKDEPLOY_REGISTRY_MANIFEST_META_KEY);
      expect(petstore?._meta?.[QUICKDEPLOY_ARD_ENTRY_META_KEY]).toMatchObject({
        identifier: "urn:air:quickdeploy.ai:mcp:petstore",
        type: "application/vnd.oai.openapi+json",
      });
      expect(petstore?._meta?.[QUICKDEPLOY_MCP_PROJECTION_META_KEY]).toMatchObject({
        entryRef: "urn:air:quickdeploy.ai:mcp:petstore",
      });
    },
    REGISTRY_BUILD_TEST_TIMEOUT_MS,
  );

  it("checks generated artifacts for drift", async () => {
    const rootDir = await fixtureRoot();
    await seedRemote(rootDir);

    expect(await checkGeneratedRegistryArtifacts({ rootDir })).toEqual({
      ok: true,
      changed: [],
    });

    const artifacts = await buildRegistryArtifacts({ rootDir });
    await writeRegistryArtifacts({ rootDir }, artifacts);
    expect(await readFile(join(rootDir, "servers.json"), "utf8")).toBe(
      artifacts.files["servers.json"],
    );
    expect(await readFile(join(rootDir, "registry", "index.json"), "utf8")).toBe(
      artifacts.generatedFiles["registry/index.json"],
    );
    expect(await checkGeneratedRegistryArtifacts({ rootDir })).toEqual({ ok: true, changed: [] });

    await writeFile(join(rootDir, "servers.json"), "{}\n", "utf8");
    expect(await checkGeneratedRegistryArtifacts({ rootDir })).toEqual({
      ok: false,
      changed: ["servers.json"],
    });
  }, 30_000);

  it("pins OCI package identifiers when image digests are available", async () => {
    const rootDir = await fixtureRoot();
    await seedOciServer(rootDir);

    const unpinned = await buildRegistryArtifacts({ rootDir });
    expect(unpinned.serversJson.servers[0]?.packages?.[0]?.identifier).toBe(
      "ghcr.io/quickdeployai/mcp-registry-asyncapi-2-mcp:0.1.0",
    );

    await mkdir(join(rootDir, "generated"), { recursive: true });
    await writeFile(
      join(rootDir, "generated", "oci-image-digests.json"),
      JSON.stringify(
        {
          images: {
            "ghcr.io/quickdeployai/mcp-registry-asyncapi-2-mcp:0.1.0":
              "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          },
        },
        null,
        2,
      ),
    );

    const pinned = await buildRegistryArtifacts({ rootDir });
    expect(pinned.serversJson.servers[0]?.packages?.[0]?.identifier).toBe(
      "ghcr.io/quickdeployai/mcp-registry-asyncapi-2-mcp@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    );
  });

  it("compiles manifests to official server.json with lossless manifest round-trip", async () => {
    const manifest = testManifest({
      spec: {
        auth: [
          {
            type: "bearer",
            valueFrom: {
              env: "PETSTORE_UPSTREAM_TOKEN",
            },
          },
          {
            type: "api-key",
            in: "query",
            name: "api_key",
            valueFrom: {
              env: "PETSTORE_QUERY_KEY",
            },
          },
          {
            type: "basic",
            usernameFrom: {
              env: "PETSTORE_USERNAME",
            },
            passwordFrom: {
              env: "PETSTORE_PASSWORD",
            },
          },
          {
            type: "oauth2",
            tokenUrl: "https://issuer.example.test/oauth/token",
            clientIdFrom: {
              env: "OAUTH_CLIENT_ID",
            },
            clientSecretFrom: {
              env: "OAUTH_CLIENT_SECRET",
            },
            scopes: ["pets:read"],
          },
        ],
        config: {
          schema: {
            type: "object",
            properties: {
              tenant: {
                type: "string",
                description: "QuickDeploy tenant slug.",
              },
              mode: {
                type: "string",
                default: "read-only",
              },
            },
            required: ["tenant"],
          },
          defaults: {
            mode: "read-only",
          },
        },
      },
      deployment: {
        auth: {
          type: "bearer",
          tokenFrom: {
            env: "PETSTORE_MCP_TOKEN",
          },
        },
        configSchema: {
          type: "object",
          properties: {
            region: {
              type: "string",
              description: "Deployment region.",
            },
          },
          required: ["region"],
        },
      },
    });

    const serverJson = compileManifestToServerJson(manifest, "registry/quickdeploy/petstore.mcp.yaml");

    expect(serverJson.$schema).toBe(
      "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
    );
    expect(serverJson.packages?.[0]).toMatchObject({
      registryType: "oci",
      identifier: "ghcr.io/quickdeployai/mcp-host",
      runtimeArguments: ["run", "registry/quickdeploy/petstore.mcp.yaml", "--transport", "streamable-http"],
      environmentVariables: [
        "OAUTH_CLIENT_ID",
        "OAUTH_CLIENT_SECRET",
        "PETSTORE_MCP_TOKEN",
        "PETSTORE_PASSWORD",
        "PETSTORE_QUERY_KEY",
        "PETSTORE_UPSTREAM_TOKEN",
        "PETSTORE_USERNAME",
        "QD_MANIFEST_REGION",
        "QD_MANIFEST_TENANT",
      ],
    });
    expect(serverJson.environmentVariables).toEqual([
      expect.objectContaining({
        name: "OAUTH_CLIENT_ID",
        isRequired: true,
        isSecret: true,
      }),
      expect.objectContaining({
        name: "OAUTH_CLIENT_SECRET",
        isRequired: true,
        isSecret: true,
      }),
      expect.objectContaining({
        name: "PETSTORE_MCP_TOKEN",
        isRequired: true,
        isSecret: true,
      }),
      expect.objectContaining({
        name: "PETSTORE_PASSWORD",
        isRequired: true,
        isSecret: true,
      }),
      expect.objectContaining({
        name: "PETSTORE_QUERY_KEY",
        isRequired: true,
        isSecret: true,
      }),
      expect.objectContaining({
        name: "PETSTORE_UPSTREAM_TOKEN",
        isRequired: true,
        isSecret: true,
      }),
      expect.objectContaining({
        name: "PETSTORE_USERNAME",
        isRequired: true,
        isSecret: true,
      }),
      expect.objectContaining({
        name: "QD_MANIFEST_REGION",
        description: "Deployment region.",
        isRequired: true,
        isSecret: false,
      }),
      expect.objectContaining({
        name: "QD_MANIFEST_TENANT",
        description: "QuickDeploy tenant slug.",
        isRequired: true,
        isSecret: false,
      }),
    ]);
    expect(extractManifestFromServerJson(serverJson)).toEqual(McpManifestSchema.parse(manifest));
    expect(serverJson).not.toHaveProperty("manifest");
  });

  it("compiles manifest server packages and remotes through the QuickDeploy proxy gateway", () => {
    const manifest = testManifest({
      server: {
        packages: [
          {
            registryType: "npm",
            identifier: "@quickdeployai/petstore-mcp",
            version: "1.0.0",
          },
          {
            registryType: "docker",
            identifier: "ghcr.io/quickdeployai/petstore-mcp:1.0.0",
          },
        ],
        remotes: [
          {
            type: "streamable-http",
            url: "https://vendor.example.test/mcp",
            variables: {
              tenant: { description: "Vendor tenant slug." },
            },
          },
        ],
      },
      deployment: {
        auth: {
          type: "bearer",
          tokenFrom: {
            env: "PETSTORE_PROXY_TOKEN",
          },
        },
      },
    });

    const serverJson = compileManifestToServerJson(
      manifest,
      "registry/quickdeploy/petstore.mcp.yaml",
    );

    expect(serverJson.packages).toEqual([
      expect.objectContaining({
        registryType: "oci",
        identifier: "ghcr.io/quickdeployai/mcp-host",
      }),
      expect.objectContaining({
        registryType: "npm",
        identifier: "@quickdeployai/petstore-mcp",
      }),
      expect.objectContaining({
        registryType: "docker",
        identifier: "ghcr.io/quickdeployai/petstore-mcp:1.0.0",
      }),
    ]);
    expect(serverJson.remotes).toEqual([
      expect.objectContaining({
        type: "streamable-http",
        url: "https://mcp.quickdeploy.ai/proxy/ai.quickdeploy%2Fpetstore/0/mcp",
        variables: {
          tenant: { description: "Vendor tenant slug." },
        },
        headers: [
          {
            name: "Authorization",
            description: "Bearer token sourced from PETSTORE_PROXY_TOKEN.",
            required: true,
            value: "Bearer ${PETSTORE_PROXY_TOKEN}",
          },
        ],
        _meta: {
          "ai.quickdeploy.registry/proxy": {
            sourceManifestPath: "registry/quickdeploy/petstore.mcp.yaml",
            remoteIndex: 0,
            upstream: {
              type: "streamable-http",
              url: "https://vendor.example.test/mcp",
              variables: {
                tenant: { description: "Vendor tenant slug." },
              },
            },
          },
        },
      }),
    ]);
  });

  it("compiles a baked manifest to a standalone digest-pinned OCI package entry", () => {
    const manifest = testManifest({
      deployment: {
        configSchema: {
          type: "object",
          properties: {
            baseUrl: {
              type: "string",
              description: "Petstore base URL.",
            },
          },
          required: ["baseUrl"],
        },
      },
    });

    const serverJson = compileBakedManifestToServerJson(manifest, {
      sourceManifestPath: "registry/quickdeploy/petstore.mcp.yaml",
      image: "ghcr.io/quickdeployai/mcp-petstore",
      digest: "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    });

    expect(serverJson.packages?.[0]).toMatchObject({
      registryType: "oci",
      identifier:
        "ghcr.io/quickdeployai/mcp-petstore@sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      version: "1.0.0",
      runtimeHint: "mcp-host",
      transport: "streamable-http",
      runtimeArguments: ["run", "/app/manifest.mcp.yaml", "--transport", "streamable-http"],
      environmentVariables: ["QD_MANIFEST_BASE_URL"],
    });
    expect(serverJson.environmentVariables).toEqual([
      expect.objectContaining({
        name: "QD_MANIFEST_BASE_URL",
        description: "Petstore base URL.",
        isRequired: true,
        isSecret: false,
      }),
    ]);
    expect(serverJson._meta?.["ai.quickdeploy.registry/bake"]).toEqual({
      sourceManifestPath: "registry/quickdeploy/petstore.mcp.yaml",
      bakedManifestPath: "/app/manifest.mcp.yaml",
      image: "ghcr.io/quickdeployai/mcp-petstore",
      digest: "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      runtime: "mcp-host",
    });
    expect(extractManifestFromServerJson(serverJson)).toEqual(McpManifestSchema.parse(manifest));
  });

  it("prints a baked manifest server.json entry from the registry-cli bake command", async () => {
    const rootDir = await fixtureRoot();
    await seedManifest(rootDir);

    const { stdout } = await runRegistryCli([
      "bake",
      "--root",
      rootDir,
      "--manifest",
      "registry/quickdeploy/petstore.mcp.yaml",
      "--image",
      "ghcr.io/quickdeployai/mcp-petstore",
      "--digest",
      "sha256:abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd",
    ]);

    const serverJson = JSON.parse(stdout) as Record<string, unknown>;
    expect(serverJson).toMatchObject({
      name: "ai.quickdeploy/petstore",
      packages: [
        {
          registryType: "oci",
          identifier:
            "ghcr.io/quickdeployai/mcp-petstore@sha256:abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd",
          runtimeArguments: ["run", "/app/manifest.mcp.yaml", "--transport", "streamable-http"],
        },
      ],
    });
  }, 60_000);

  it("rejects manifest config that is not supported by the referenced importer", () => {
    expect(() =>
      compileManifestToServerJson(
        testManifest({
          spec: {
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
        "registry/quickdeploy/petstore.mcp.yaml",
      ),
    ).toThrow(
      /Invalid importer config in registry\/quickdeploy\/petstore\.mcp\.yaml: openapi-2-mcp config field "unsupported"/,
    );
  });
});

function testManifest(
  overrides: {
    spec?: Record<string, unknown>;
    deployment?: Record<string, unknown>;
    server?: Record<string, unknown>;
  } = {},
): Record<string, unknown> {
  const manifest: Record<string, unknown> = {
    apiVersion: "quickdeploy.ai/v1",
    kind: "McpManifest",
    metadata: {
      name: "ai.quickdeploy/petstore",
      version: "1.0.0",
      title: "Petstore",
      description: "Selected Petstore operations exposed as MCP tools.",
      labels: ["openapi", "petstore"],
    },
    spec: {
      importer: {
        engine: "openapi-2-mcp",
        versionRange: "^0.1.0",
      },
      source: {
        type: "http",
        uri: "https://petstore3.swagger.io/api/v3/openapi.json",
      },
      select: {
        requests: [
          {
            method: "get",
            uriTemplate: "/pet/{petId}",
          },
        ],
      },
      expose: {
        tools: [
          {
            from: "GET /pet/{petId}",
            name: "get_pet",
          },
        ],
      },
      ...overrides.spec,
    },
    deployment: {
      transport: "streamable-http",
      auth: {
        type: "none",
      },
      ...overrides.deployment,
    },
  };
  if (overrides.server) manifest.server = overrides.server;
  return manifest;
}

async function fixtureRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), "registry-cli-"));
}

async function runRegistryCli(args: string[]): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(
    process.execPath,
    [
      join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs"),
      join("src", "cli.mts"),
      ...args,
    ],
    {
      cwd: process.cwd(),
      windowsHide: true,
    },
  );
}

async function seedIgnoredPackageServer(rootDir: string): Promise<void> {
  const targetDir = join(rootDir, "packages", "importers", "quickdeploy-admin");
  await mkdir(targetDir, { recursive: true });
  await writeFile(
    join(targetDir, "server.json"),
    JSON.stringify(
      {
        $schema: "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
        name: "ai.quickdeploy/admin",
        version: "0.1.0",
        description: "Ignored package descriptor.",
        packages: [
          {
            registryType: "npm",
            identifier: "@quickdeployai/mcp-admin",
            version: "0.1.0",
          },
        ],
      },
      null,
      2,
    ),
  );
}

async function seedOciServer(rootDir: string): Promise<void> {
  const targetDir = join(rootDir, "registry", "example");
  await mkdir(targetDir, { recursive: true });
  await writeFile(
    join(targetDir, "oci.server.json"),
    JSON.stringify(
      {
        $schema: "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
        name: "com.example/oci-mcp",
        version: "0.1.0",
        description: "OCI packaged MCP server.",
        packages: [
          {
            registryType: "oci",
            identifier: "ghcr.io/quickdeployai/mcp-registry-asyncapi-2-mcp:0.1.0",
            version: "0.1.0",
          },
        ],
        _meta: {
          "ai.quickdeploy.registry/curation": {
            verifiedStatus: "review",
            category: "example",
            isOfficial: true,
            tags: ["oci"],
          },
        },
      },
      null,
      2,
    ),
  );
}

async function seedRemote(rootDir: string): Promise<void> {
  const targetDir = join(rootDir, "registry", "linear");
  await mkdir(targetDir, { recursive: true });
  await writeFile(
    join(targetDir, "mcp.server.json"),
    JSON.stringify(
      {
        $schema: "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
        name: "com.linear/mcp",
        version: "1.0.0",
        description: "Linear hosted MCP endpoint.",
        remotes: [{ type: "streamable-http", url: "https://mcp.linear.app/mcp" }],
        _meta: {
          "ai.quickdeploy.registry/curation": {
            verifiedStatus: "review",
            category: "productivity",
            isOfficial: true,
            tags: ["linear", "remote"],
          },
        },
      },
      null,
      2,
    ),
  );
}

async function seedManifest(rootDir: string): Promise<void> {
  const targetDir = join(rootDir, "registry", "quickdeploy");
  await mkdir(targetDir, { recursive: true });
  await writeFile(
    join(targetDir, "petstore.mcp.yaml"),
    [
      "apiVersion: quickdeploy.ai/v1",
      "kind: McpManifest",
      "metadata:",
      "  name: ai.quickdeploy/petstore",
      "  version: 1.0.0",
      "  title: Petstore",
      "  description: Selected Petstore operations exposed as MCP tools.",
      "  labels: [openapi, petstore]",
      "spec:",
      "  importer:",
      "    engine: openapi-2-mcp",
      "    versionRange: ^0.1.0",
      "  source:",
      "    type: http",
      "    uri: https://petstore3.swagger.io/api/v3/openapi.json",
      "  select:",
      "    requests:",
      "      - method: get",
      "        uriTemplate: /pet/{petId}",
      "  expose:",
      "    tools:",
      "      - from: GET /pet/{petId}",
      "        name: get_pet",
      "deployment:",
      "  transport: streamable-http",
      "  auth:",
      "    type: none",
      "",
    ].join("\n"),
  );
}

async function seedArdProjection(rootDir: string): Promise<void> {
  const targetDir = join(rootDir, "registry", "quickdeploy");
  await mkdir(targetDir, { recursive: true });
  await writeFile(
    join(targetDir, "petstore.ard.json"),
    JSON.stringify({
      identifier: "urn:air:quickdeploy.ai:mcp:petstore",
      displayName: "Petstore",
      type: "application/vnd.oai.openapi+json",
      version: "1.0.0",
      url: "https://petstore3.swagger.io/api/v3/openapi.json",
      tags: ["openapi", "petstore"],
    }),
  );
  await writeFile(
    join(targetDir, "petstore.projection.json"),
    JSON.stringify({
      kind: "McpProjectionConfig",
      entryRef: "urn:air:quickdeploy.ai:mcp:petstore",
      select: { requests: [{ method: "get", uriTemplate: "/pet/{petId}" }] },
      expose: { tools: [{ from: "GET /pet/{petId}", name: "get_pet" }] },
      deployment: { transport: "streamable-http", auth: { type: "none" } },
    }),
  );
}
