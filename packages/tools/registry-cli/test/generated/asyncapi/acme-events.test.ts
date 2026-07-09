import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  QUICKDEPLOY_REGISTRY_MANIFEST_META_KEY,
  McpManifestSchema,
  validateMcpManifestImporterConfig,
} from "@quickdeployai/registry-schemas";
import { buildRegistryArtifacts, compileManifestToServerJson } from "../../../src/registry-build";

const FAMILY = "asyncapi";
const PROVIDER = "acme-events";
const CAPABILITY = "events";
const MANIFEST_PATH = "registry/acme-events/events.mcp.json";
const MANIFEST = {
  "apiVersion": "quickdeploy.ai/v1",
  "kind": "McpManifest",
  "metadata": {
    "name": "ai.quickdeploy/acme-events",
    "version": "0.1.0",
    "title": "Acme Events",
    "description": "Generated asyncapi-2-mcp MCP manifest for Acme Events.",
    "labels": [
      "acme-events",
      "asyncapi",
      "generated"
    ]
  },
  "spec": {
    "importer": {
      "engine": "asyncapi-2-mcp",
      "versionRange": "^0.1.0"
    },
    "source": {
      "type": "http",
      "uri": "https://events.example.test/asyncapi.json"
    },
    "select": {
      "requests": [
        {
          "method": "PUBLISH",
          "uriTemplate": "channel://orders.created"
        }
      ],
      "grpcMethods": [],
      "pythonFunctions": [],
      "skills": [],
      "knowledgeSources": [],
      "corpusGlobs": []
    },
    "auth": [
      {
        "type": "api-key",
        "in": "header",
        "name": "x-api-key",
        "valueFrom": {
          "env": "ACME_EVENTS_API_KEY"
        }
      }
    ],
    "config": {
      "schema": {
        "type": "object",
        "properties": {
          "brokerProtocol": {
            "type": "string"
          }
        }
      },
      "defaults": {
        "brokerProtocol": "kafka"
      },
      "ai.quickdeploy.codegen/source": {
        "uri": "https://events.example.test/asyncapi.json",
        "type": "http",
        "retrievedAt": "2026-07-09",
        "sourceVersion": "1.2.0"
      },
      "ai.quickdeploy.codegen/policy": {
        "network": [
          "source-uri",
          "configured-upstream"
        ],
        "filesystem": [
          "generated-project-readwrite"
        ],
        "process": [
          "none"
        ],
        "generatedExecution": "openshell-mxc-only",
        "unavailableRuntime": "fail-closed"
      }
    },
    "expose": {
      "tools": [
        {
          "from": "PUBLISH channel://orders.created",
          "name": "publish_channel_orders_created",
          "deny": false
        }
      ],
      "resources": [],
      "prompts": []
    }
  },
  "deployment": {
    "transport": "streamable-http",
    "auth": {
      "type": "none"
    },
    "userConfig": {}
  },
  "_meta": {
    "ai.quickdeploy.codegen/source": {
      "uri": "https://events.example.test/asyncapi.json",
      "type": "http",
      "retrievedAt": "2026-07-09",
      "sourceVersion": "1.2.0"
    },
    "ai.quickdeploy.codegen/policy": {
      "network": [
        "source-uri",
        "configured-upstream"
      ],
      "filesystem": [
        "generated-project-readwrite"
      ],
      "process": [
        "none"
      ],
      "generatedExecution": "openshell-mxc-only",
      "unavailableRuntime": "fail-closed"
    }
  }
} as const;
const EXPECTED = {
  "serverName": "ai.quickdeploy/acme-events",
  "source": {
    "type": "http",
    "uri": "https://events.example.test/asyncapi.json"
  },
  "importer": {
    "engine": "asyncapi-2-mcp",
    "versionRange": "^0.1.0"
  },
  "expose": {
    "tools": [
      {
        "from": "PUBLISH channel://orders.created",
        "name": "publish_channel_orders_created",
        "deny": false
      }
    ],
    "resources": [],
    "prompts": []
  },
  "environmentVariables": [
    {
      "name": "ACME_EVENTS_API_KEY",
      "description": "Secret used by api-key upstream authentication.",
      "isRequired": true,
      "isSecret": true
    }
  ]
} as const;

describe(`generated MCP manifest contract: ${FAMILY}/${PROVIDER}`, () => {
  it("keeps the generated manifest schema-valid", () => {
    const manifest = parseManifest();

    expect(manifest.metadata.name).toBe(EXPECTED.serverName);
    expect(manifest.spec.source).toEqual(EXPECTED.source);
    expect(manifest.spec.importer).toMatchObject(EXPECTED.importer);
    expect(manifest.metadata.labels).toEqual(expect.arrayContaining(["generated", FAMILY, PROVIDER]));
    expect(manifest.spec.config).toEqual(MANIFEST.spec.config);
    expect(manifest._meta).toEqual(MANIFEST._meta);
  });

  it("matches manifest-selected tools, resources, prompts, and env vars", () => {
    const manifest = parseManifest();
    const server = compileManifestToServerJson(manifest, MANIFEST_PATH);

    expect(publicExpose(manifest.spec.expose.tools)).toEqual(EXPECTED.expose.tools);
    expect(publicExpose(manifest.spec.expose.resources)).toEqual(EXPECTED.expose.resources);
    expect(publicExpose(manifest.spec.expose.prompts)).toEqual(EXPECTED.expose.prompts);
    expect(server.environmentVariables ?? []).toEqual(EXPECTED.environmentVariables);
    expect(server.packages?.[0]?.environmentVariables ?? []).toEqual(expectedEnvironmentVariableNames());
  });

  it("compiles to the expected server.json entry shape", () => {
    const manifest = parseManifest();
    const server = compileManifestToServerJson(manifest, MANIFEST_PATH);

    expect(server.name).toBe(EXPECTED.serverName);
    expect(server.packages?.[0]).toMatchObject({
      registryType: "oci",
      identifier: "ghcr.io/quickdeployai/mcp-host",
      runtimeHint: "mcp-host",
      transport: manifest.deployment.transport,
      runtimeArguments: ["run", MANIFEST_PATH, "--transport", manifest.deployment.transport],
    });
    expect(server._meta?.[QUICKDEPLOY_REGISTRY_MANIFEST_META_KEY]).toEqual(manifest);
  });

  it("produces deterministic registry output", async () => {
    const manifest = parseManifest();
    const rootDir = await mkdtemp(join(tmpdir(), `generated-mcp-${PROVIDER}-`));
    const targetPath = join(rootDir, MANIFEST_PATH);
    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(targetPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

    const first = await buildRegistryArtifacts({ rootDir });
    const second = await buildRegistryArtifacts({ rootDir });

    expect(second.files).toEqual(first.files);
    expect(second.generatedFiles).toEqual(first.generatedFiles);
    expect(first.serversJson.servers.map((server) => server.name)).toEqual([EXPECTED.serverName]);
    expect(first.indexJson.providers).toEqual([
      {
        id: PROVIDER,
        entries: [
          {
            kind: "mcp-manifest",
            name: EXPECTED.serverName,
            path: MANIFEST_PATH,
            version: manifest.metadata.version,
          },
        ],
      },
    ]);
  });
});

function parseManifest() {
  return validateMcpManifestImporterConfig(McpManifestSchema.parse(MANIFEST));
}

function expectedEnvironmentVariableNames(): string[] {
  return (EXPECTED.environmentVariables as readonly { readonly name: string }[]).map(
    (variable) => variable.name,
  );
}

function publicExpose(
  items: readonly { readonly from: string; readonly name?: string; readonly deny?: boolean; readonly reason?: string }[],
) {
  return items
    .filter((item) => !item.deny)
    .map((item) => ({
      from: item.from,
      ...(item.name ? { name: item.name } : {}),
      deny: false,
      ...(item.reason ? { reason: item.reason } : {}),
    }));
}
