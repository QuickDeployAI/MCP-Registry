import { describeGeneratedMcpManifest } from "../generated-test-helpers";

describeGeneratedMcpManifest({
  family: "openapi",
  provider: "box",
  manifestPath: "registry/box/api.mcp.json",
  manifest: {
    "apiVersion": "quickdeploy.ai/v1",
    "kind": "McpManifest",
    "metadata": {
      "name": "ai.quickdeploy/box",
      "version": "0.1.0",
      "title": "Box",
      "description": "Generated Box Platform folders read-only OpenAPI MCP catalog manifest.",
      "labels": [
        "box",
        "content",
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
        "uri": "https://raw.githubusercontent.com/box/box-openapi/c9a878a9824344129881392e2b08f7117201e82e/openapi.json",
        "digest": "sha256:70adf696ed3955729f9c75d11f34658477c0ee143d9ff6252928f5bc0fa6d499",
        "ref": "c9a878a9824344129881392e2b08f7117201e82e"
      },
      "select": {
        "requests": [
          {
            "method": "GET",
            "uriTemplate": "/folders/{folder_id}/items"
          },
          {
            "method": "GET",
            "uriTemplate": "/folders/{folder_id}"
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
            "env": "BOX_ACCESS_TOKEN"
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
              "description": "Box Platform API base URL."
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
          "baseUrl": "https://api.box.com/2.0",
          "requestTimeoutMs": 30000,
          "mode": "read-only"
        },
        "ai.quickdeploy.codegen/source": {
          "uri": "https://raw.githubusercontent.com/box/box-openapi/c9a878a9824344129881392e2b08f7117201e82e/openapi.json",
          "type": "http",
          "digest": "sha256:70adf696ed3955729f9c75d11f34658477c0ee143d9ff6252928f5bc0fa6d499",
          "ref": "c9a878a9824344129881392e2b08f7117201e82e",
          "retrievedAt": "2026-07-09",
          "sourceVersion": "box/box-openapi@c9a878a9824344129881392e2b08f7117201e82e",
          "notes": [
            "Official Box OpenAPI repository: https://github.com/box/box-openapi",
            "Pinned source path: openapi.json",
            "Pinned commit date: 2026-06-29T13:04:38Z",
            "Pinned Git blob SHA: 477936cfdbeadd637da0074ae7b264518986dbdf",
            "OpenAPI document info: title \"Box Platform API\", version 2024.0",
            "Verified source SHA-256: 70adf696ed3955729f9c75d11f34658477c0ee143d9ff6252928f5bc0fa6d499",
            "The committed manifest selects read-only Box folder list/get operations only."
          ]
        },
        "ai.quickdeploy.codegen/policy": {
          "network": [
            "GET https://raw.githubusercontent.com/box/box-openapi/c9a878a9824344129881392e2b08f7117201e82e/openapi.json for source retrieval",
            "GET https://api.box.com/2.0/folders/{folder_id}/items for selected upstream operation",
            "GET https://api.box.com/2.0/folders/{folder_id} for selected upstream operation"
          ],
          "filesystem": [
            "Read committed manifest registry/box/api.mcp.json",
            "Read committed generated test packages/tools/registry-cli/test/generated/openapi/box.test.ts",
            "Read/write gitignored generated project .generated/mcp-codegen/openapi/box/"
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
            "from": "GET /folders/{folder_id}/items",
            "name": "list_box_folder_items",
            "deny": false
          },
          {
            "from": "GET /folders/{folder_id}",
            "name": "get_box_folder",
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
        "uri": "https://raw.githubusercontent.com/box/box-openapi/c9a878a9824344129881392e2b08f7117201e82e/openapi.json",
        "type": "http",
        "digest": "sha256:70adf696ed3955729f9c75d11f34658477c0ee143d9ff6252928f5bc0fa6d499",
        "ref": "c9a878a9824344129881392e2b08f7117201e82e",
        "retrievedAt": "2026-07-09",
        "sourceVersion": "box/box-openapi@c9a878a9824344129881392e2b08f7117201e82e",
        "notes": [
          "Official Box OpenAPI repository: https://github.com/box/box-openapi",
          "Pinned source path: openapi.json",
          "Pinned commit date: 2026-06-29T13:04:38Z",
          "Pinned Git blob SHA: 477936cfdbeadd637da0074ae7b264518986dbdf",
          "OpenAPI document info: title \"Box Platform API\", version 2024.0",
          "Verified source SHA-256: 70adf696ed3955729f9c75d11f34658477c0ee143d9ff6252928f5bc0fa6d499",
          "The committed manifest selects read-only Box folder list/get operations only."
        ]
      },
      "ai.quickdeploy.codegen/policy": {
        "network": [
          "GET https://raw.githubusercontent.com/box/box-openapi/c9a878a9824344129881392e2b08f7117201e82e/openapi.json for source retrieval",
          "GET https://api.box.com/2.0/folders/{folder_id}/items for selected upstream operation",
          "GET https://api.box.com/2.0/folders/{folder_id} for selected upstream operation"
        ],
        "filesystem": [
          "Read committed manifest registry/box/api.mcp.json",
          "Read committed generated test packages/tools/registry-cli/test/generated/openapi/box.test.ts",
          "Read/write gitignored generated project .generated/mcp-codegen/openapi/box/"
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
        "from": "GET /folders/{folder_id}/items",
        "name": "list_box_folder_items",
        "deny": false
      },
      {
        "from": "GET /folders/{folder_id}",
        "name": "get_box_folder",
        "deny": false
      }
    ],
    "resources": [],
    "prompts": [],
    "authEnvVars": [
      "BOX_ACCESS_TOKEN"
    ],
    "serverEnvVars": [
      "BOX_ACCESS_TOKEN"
    ]
  },
});
