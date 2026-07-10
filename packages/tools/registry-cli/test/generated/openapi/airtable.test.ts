import { describeGeneratedMcpManifest } from "../generated-test-helpers";

describeGeneratedMcpManifest({
  family: "openapi",
  provider: "airtable",
  manifestPath: "registry/airtable/api.mcp.json",
  manifest: {
    "apiVersion": "quickdeploy.ai/v1",
    "kind": "McpManifest",
    "metadata": {
      "name": "ai.quickdeploy/airtable",
      "version": "0.1.0",
      "title": "Airtable",
      "description": "Generated Airtable Web API read-only OpenAPI MCP catalog manifest.",
      "labels": [
        "airtable",
        "airtable-web-api",
        "generated",
        "openapi",
        "read-only"
      ]
    },
    "spec": {
      "importer": {
        "engine": "openapi-2-mcp",
        "versionRange": "^0.1.0"
      },
      "source": {
        "type": "http",
        "uri": "https://airtable.com/developers/web/api/introduction",
        "digest": "sha256:b5cd8b097170376bb051200cdf57e9a809c6743e855d9d10bff805ace6165d2c",
        "ref": "airtable-web-api-docs@2026-07-09"
      },
      "select": {
        "requests": [
          {
            "method": "GET",
            "uriTemplate": "/v0/meta/bases"
          },
          {
            "method": "GET",
            "uriTemplate": "/v0/meta/bases/{baseId}/tables"
          },
          {
            "method": "GET",
            "uriTemplate": "/v0/{baseId}/{tableIdOrName}"
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
          "type": "bearer",
          "valueFrom": {
            "env": "AIRTABLE_ACCESS_TOKEN"
          }
        }
      ],
      "config": {
        "schema": {
          "type": "object",
          "properties": {
            "baseUrl": {
              "type": "string",
              "format": "uri",
              "description": "Airtable Web API base URL."
            },
            "requestTimeoutMs": {
              "type": "number",
              "minimum": 1,
              "description": "Per-request upstream timeout in milliseconds."
            },
            "mode": {
              "type": "string",
              "description": "Importer execution profile."
            }
          }
        },
        "defaults": {
          "baseUrl": "https://api.airtable.com",
          "requestTimeoutMs": 30000,
          "mode": "read-only"
        },
        "ai.quickdeploy.codegen/source": {
          "uri": "https://airtable.com/developers/web/api/introduction",
          "type": "http",
          "digest": "sha256:b5cd8b097170376bb051200cdf57e9a809c6743e855d9d10bff805ace6165d2c",
          "ref": "airtable-web-api-docs@2026-07-09",
          "retrievedAt": "2026-07-09",
          "sourceVersion": "airtable-web-api-docs@2026-07-09",
          "notes": [
            "Official Airtable Web API documentation page for the API introduction.",
            "Airtable does not publish a first-party OpenAPI/Swagger document; only community-generated converters exist. This manifest pins the official documentation source used for the catalog entry, matching the Salesforce/HubSpot precedent (QUI-351/QUI-352).",
            "Canonical source URL: https://airtable.com/developers/web/api/introduction",
            "Verified source SHA-256: b5cd8b097170376bb051200cdf57e9a809c6743e855d9d10bff805ace6165d2c",
            "Selected operations cross-checked against the official per-endpoint docs pages: list-bases, get-base-schema, list-records.",
            "The committed manifest selects read-only Airtable list-bases, base-schema, and list-records operations only."
          ]
        },
        "ai.quickdeploy.codegen/policy": {
          "network": [
            "GET https://airtable.com/developers/web/api/introduction for source retrieval",
            "GET https://api.airtable.com/v0/meta/bases for selected upstream operation",
            "GET https://api.airtable.com/v0/meta/bases/{baseId}/tables for selected upstream operation",
            "GET https://api.airtable.com/v0/{baseId}/{tableIdOrName} for selected upstream operation"
          ],
          "filesystem": [
            "Read committed manifest registry/airtable/api.mcp.json",
            "Read committed generated test packages/tools/registry-cli/test/generated/openapi/airtable.test.ts",
            "Read/write gitignored generated project .generated/mcp-codegen/openapi/airtable/"
          ],
          "process": [
            "Run pnpm build/test scripts only inside OpenShell-backed MXC isolation",
            "Run node only as invoked by generated project package scripts inside OpenShell-backed MXC isolation"
          ],
          "generatedExecution": "openshell-mxc-only",
          "unavailableRuntime": "fail-closed"
        }
      },
      "expose": {
        "tools": [
          {
            "from": "GET /v0/meta/bases",
            "name": "list_airtable_bases",
            "deny": false
          },
          {
            "from": "GET /v0/meta/bases/{baseId}/tables",
            "name": "get_airtable_base_schema",
            "deny": false
          },
          {
            "from": "GET /v0/{baseId}/{tableIdOrName}",
            "name": "list_airtable_records",
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
        "uri": "https://airtable.com/developers/web/api/introduction",
        "type": "http",
        "digest": "sha256:b5cd8b097170376bb051200cdf57e9a809c6743e855d9d10bff805ace6165d2c",
        "ref": "airtable-web-api-docs@2026-07-09",
        "retrievedAt": "2026-07-09",
        "sourceVersion": "airtable-web-api-docs@2026-07-09",
        "notes": [
          "Official Airtable Web API documentation page for the API introduction.",
          "Airtable does not publish a first-party OpenAPI/Swagger document; only community-generated converters exist. This manifest pins the official documentation source used for the catalog entry, matching the Salesforce/HubSpot precedent (QUI-351/QUI-352).",
          "Canonical source URL: https://airtable.com/developers/web/api/introduction",
          "Verified source SHA-256: b5cd8b097170376bb051200cdf57e9a809c6743e855d9d10bff805ace6165d2c",
          "Selected operations cross-checked against the official per-endpoint docs pages: list-bases, get-base-schema, list-records.",
          "The committed manifest selects read-only Airtable list-bases, base-schema, and list-records operations only."
        ]
      },
      "ai.quickdeploy.codegen/policy": {
        "network": [
          "GET https://airtable.com/developers/web/api/introduction for source retrieval",
          "GET https://api.airtable.com/v0/meta/bases for selected upstream operation",
          "GET https://api.airtable.com/v0/meta/bases/{baseId}/tables for selected upstream operation",
          "GET https://api.airtable.com/v0/{baseId}/{tableIdOrName} for selected upstream operation"
        ],
        "filesystem": [
          "Read committed manifest registry/airtable/api.mcp.json",
          "Read committed generated test packages/tools/registry-cli/test/generated/openapi/airtable.test.ts",
          "Read/write gitignored generated project .generated/mcp-codegen/openapi/airtable/"
        ],
        "process": [
          "Run pnpm build/test scripts only inside OpenShell-backed MXC isolation",
          "Run node only as invoked by generated project package scripts inside OpenShell-backed MXC isolation"
        ],
        "generatedExecution": "openshell-mxc-only",
        "unavailableRuntime": "fail-closed"
      }
    }
  },
  expected: {
    "tools": [
      {
        "from": "GET /v0/meta/bases",
        "name": "list_airtable_bases",
        "deny": false
      },
      {
        "from": "GET /v0/meta/bases/{baseId}/tables",
        "name": "get_airtable_base_schema",
        "deny": false
      },
      {
        "from": "GET /v0/{baseId}/{tableIdOrName}",
        "name": "list_airtable_records",
        "deny": false
      }
    ],
    "resources": [],
    "prompts": [],
    "authEnvVars": [
      "AIRTABLE_ACCESS_TOKEN"
    ],
    "serverEnvVars": [
      "AIRTABLE_ACCESS_TOKEN"
    ]
  },
});
