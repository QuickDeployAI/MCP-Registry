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

const FAMILY = "wsdl";
const PROVIDER = "acme-soap";
const CAPABILITY = "wsdl";
const MANIFEST_PATH = "registry/acme-soap/wsdl.mcp.json";
const MANIFEST = {
  "apiVersion": "quickdeploy.ai/v1",
  "kind": "McpManifest",
  "metadata": {
    "name": "ai.quickdeploy/acme-soap",
    "version": "0.1.0",
    "title": "Acme Soap",
    "description": "Generated wsdl-2-mcp MCP manifest for Acme Soap.",
    "labels": [
      "acme-soap",
      "generated",
      "wsdl"
    ]
  },
  "spec": {
    "importer": {
      "engine": "wsdl-2-mcp",
      "versionRange": "^0.1.0"
    },
    "source": {
      "type": "http",
      "uri": "https://soap.example.test/service.wsdl"
    },
    "select": {
      "requests": [
        {
          "method": "SOAP",
          "uriTemplate": "Calculator/Add"
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
        "type": "basic",
        "usernameFrom": {
          "env": "ACME_SOAP_USERNAME"
        },
        "passwordFrom": {
          "env": "ACME_SOAP_PASSWORD"
        }
      }
    ],
    "config": {
      "schema": {
        "type": "object",
        "properties": {
          "endpoint": {
            "type": "string"
          }
        }
      },
      "defaults": {
        "endpoint": "https://soap.example.test/service"
      },
      "ai.quickdeploy.codegen/source": {
        "uri": "https://soap.example.test/service.wsdl",
        "type": "http",
        "retrievedAt": "2026-07-09",
        "sourceVersion": "service-v3"
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
          "from": "SOAP Calculator/Add",
          "name": "soap_calculator_add",
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
      "uri": "https://soap.example.test/service.wsdl",
      "type": "http",
      "retrievedAt": "2026-07-09",
      "sourceVersion": "service-v3"
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
  "serverName": "ai.quickdeploy/acme-soap",
  "source": {
    "type": "http",
    "uri": "https://soap.example.test/service.wsdl"
  },
  "importer": {
    "engine": "wsdl-2-mcp",
    "versionRange": "^0.1.0"
  },
  "expose": {
    "tools": [
      {
        "from": "SOAP Calculator/Add",
        "name": "soap_calculator_add",
        "deny": false
      }
    ],
    "resources": [],
    "prompts": []
  },
  "environmentVariables": [
    {
      "name": "ACME_SOAP_PASSWORD",
      "description": "Secret used by basic upstream authentication.",
      "isRequired": true,
      "isSecret": true
    },
    {
      "name": "ACME_SOAP_USERNAME",
      "description": "Secret used by basic upstream authentication.",
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
