import { describeGeneratedMcpManifest } from "../generated-test-helpers";

describeGeneratedMcpManifest({
  family: "openapi",
  provider: "xero",
  manifestPath: "registry/xero/api.mcp.json",
  manifest: {
    "apiVersion": "quickdeploy.ai/v1",
    "kind": "McpManifest",
    "metadata": {
      "name": "ai.quickdeploy/xero",
      "version": "0.1.0",
      "title": "Xero",
      "description": "Generated Xero Accounting read-only OpenAPI MCP catalog manifest.",
      "labels": [
        "generated",
        "openapi",
        "read-only",
        "xero",
        "xero-accounting"
      ]
    },
    "spec": {
      "importer": {
        "engine": "openapi-2-mcp",
        "versionRange": "^0.1.0"
      },
      "source": {
        "type": "http",
        "uri": "https://raw.githubusercontent.com/XeroAPI/Xero-OpenAPI/f8cf55be5de745938d073fbeab0a6820f6bd3563/xero_accounting.yaml",
        "digest": "sha256:271539c6afbfda79dfb49e9c54cbcc8e3338e3c0f095df24811bb9408394991c",
        "ref": "f8cf55be5de745938d073fbeab0a6820f6bd3563"
      },
      "select": {
        "requests": [
          {
            "method": "GET",
            "uriTemplate": "/Organisation"
          },
          {
            "method": "GET",
            "uriTemplate": "/Accounts"
          },
          {
            "method": "GET",
            "uriTemplate": "/Accounts/{AccountID}"
          },
          {
            "method": "GET",
            "uriTemplate": "/Currencies"
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
            "env": "XERO_ACCESS_TOKEN"
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
              "description": "Xero Accounting API base URL."
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
          "baseUrl": "https://api.xero.com/api.xro/2.0",
          "requestTimeoutMs": 30000,
          "mode": "read-only"
        },
        "ai.quickdeploy.codegen/source": {
          "uri": "https://raw.githubusercontent.com/XeroAPI/Xero-OpenAPI/f8cf55be5de745938d073fbeab0a6820f6bd3563/xero_accounting.yaml",
          "type": "http",
          "digest": "sha256:271539c6afbfda79dfb49e9c54cbcc8e3338e3c0f095df24811bb9408394991c",
          "ref": "f8cf55be5de745938d073fbeab0a6820f6bd3563",
          "retrievedAt": "2026-07-09",
          "sourceVersion": "XeroAPI/Xero-OpenAPI@f8cf55be5de745938d073fbeab0a6820f6bd3563",
          "notes": [
            "Official Xero OpenAPI description repository: https://github.com/XeroAPI/Xero-OpenAPI",
            "Pinned source path: xero_accounting.yaml (Xero Accounting API, OpenAPI 3.0.0, spec version 16.0.0)",
            "Pinned commit date: 2026-06-03 (chore: bump version to 16.0.0)",
            "Verified source SHA-256: 271539c6afbfda79dfb49e9c54cbcc8e3338e3c0f095df24811bb9408394991c",
            "The committed manifest selects read-only Xero Accounting organisation, chart-of-accounts, and currency operations only."
          ]
        },
        "ai.quickdeploy.codegen/policy": {
          "network": [
            "GET https://raw.githubusercontent.com/XeroAPI/Xero-OpenAPI/f8cf55be5de745938d073fbeab0a6820f6bd3563/xero_accounting.yaml for source retrieval",
            "GET https://api.xero.com/api.xro/2.0/Organisation for selected upstream operation",
            "GET https://api.xero.com/api.xro/2.0/Accounts for selected upstream operation",
            "GET https://api.xero.com/api.xro/2.0/Accounts/{AccountID} for selected upstream operation",
            "GET https://api.xero.com/api.xro/2.0/Currencies for selected upstream operation"
          ],
          "filesystem": [
            "Read committed manifest registry/xero/api.mcp.json",
            "Read committed generated test packages/tools/registry-cli/test/generated/openapi/xero.test.ts",
            "Read/write gitignored generated project .generated/mcp-codegen/openapi/xero/"
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
            "from": "GET /Organisation",
            "name": "get_xero_organisations",
            "deny": false
          },
          {
            "from": "GET /Accounts",
            "name": "list_xero_accounts",
            "deny": false
          },
          {
            "from": "GET /Accounts/{AccountID}",
            "name": "get_xero_account",
            "deny": false
          },
          {
            "from": "GET /Currencies",
            "name": "list_xero_currencies",
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
        "uri": "https://raw.githubusercontent.com/XeroAPI/Xero-OpenAPI/f8cf55be5de745938d073fbeab0a6820f6bd3563/xero_accounting.yaml",
        "type": "http",
        "digest": "sha256:271539c6afbfda79dfb49e9c54cbcc8e3338e3c0f095df24811bb9408394991c",
        "ref": "f8cf55be5de745938d073fbeab0a6820f6bd3563",
        "retrievedAt": "2026-07-09",
        "sourceVersion": "XeroAPI/Xero-OpenAPI@f8cf55be5de745938d073fbeab0a6820f6bd3563",
        "notes": [
          "Official Xero OpenAPI description repository: https://github.com/XeroAPI/Xero-OpenAPI",
          "Pinned source path: xero_accounting.yaml (Xero Accounting API, OpenAPI 3.0.0, spec version 16.0.0)",
          "Pinned commit date: 2026-06-03 (chore: bump version to 16.0.0)",
          "Verified source SHA-256: 271539c6afbfda79dfb49e9c54cbcc8e3338e3c0f095df24811bb9408394991c",
          "The committed manifest selects read-only Xero Accounting organisation, chart-of-accounts, and currency operations only."
        ]
      },
      "ai.quickdeploy.codegen/policy": {
        "network": [
          "GET https://raw.githubusercontent.com/XeroAPI/Xero-OpenAPI/f8cf55be5de745938d073fbeab0a6820f6bd3563/xero_accounting.yaml for source retrieval",
          "GET https://api.xero.com/api.xro/2.0/Organisation for selected upstream operation",
          "GET https://api.xero.com/api.xro/2.0/Accounts for selected upstream operation",
          "GET https://api.xero.com/api.xro/2.0/Accounts/{AccountID} for selected upstream operation",
          "GET https://api.xero.com/api.xro/2.0/Currencies for selected upstream operation"
        ],
        "filesystem": [
          "Read committed manifest registry/xero/api.mcp.json",
          "Read committed generated test packages/tools/registry-cli/test/generated/openapi/xero.test.ts",
          "Read/write gitignored generated project .generated/mcp-codegen/openapi/xero/"
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
        "from": "GET /Organisation",
        "name": "get_xero_organisations",
        "deny": false
      },
      {
        "from": "GET /Accounts",
        "name": "list_xero_accounts",
        "deny": false
      },
      {
        "from": "GET /Accounts/{AccountID}",
        "name": "get_xero_account",
        "deny": false
      },
      {
        "from": "GET /Currencies",
        "name": "list_xero_currencies",
        "deny": false
      }
    ],
    "resources": [],
    "prompts": [],
    "authEnvVars": [
      "XERO_ACCESS_TOKEN"
    ],
    "serverEnvVars": [
      "XERO_ACCESS_TOKEN"
    ]
  },
});
