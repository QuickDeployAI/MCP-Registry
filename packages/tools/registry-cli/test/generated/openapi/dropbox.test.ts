import { describeGeneratedMcpManifest } from "../generated-test-helpers";

describeGeneratedMcpManifest({
  family: "openapi",
  provider: "dropbox",
  manifestPath: "registry/dropbox/api.mcp.json",
  manifest: {
    "apiVersion": "quickdeploy.ai/v1",
    "kind": "McpManifest",
    "metadata": {
      "name": "ai.quickdeploy/dropbox",
      "version": "0.1.0",
      "title": "Dropbox",
      "description": "Generated Dropbox Sign signature requests read-only OpenAPI MCP catalog manifest.",
      "labels": [
        "dropbox",
        "dropbox-sign",
        "e-signature",
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
        "uri": "https://raw.githubusercontent.com/hellosign/hellosign-openapi/31136f9035133acb5f055a94f24e006857210fdb/openapi.yaml",
        "digest": "sha256:2ea3f04008afe945d45ba8a6da41c4f1612cc899ba0c96cf36b4da00ce7419ec",
        "ref": "31136f9035133acb5f055a94f24e006857210fdb"
      },
      "select": {
        "requests": [
          {
            "method": "GET",
            "uriTemplate": "/signature_request/list"
          },
          {
            "method": "GET",
            "uriTemplate": "/signature_request/{signature_request_id}"
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
            "env": "DROPBOX_SIGN_ACCESS_TOKEN"
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
              "description": "Dropbox Sign API base URL."
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
          "baseUrl": "https://api.hellosign.com/v3",
          "requestTimeoutMs": 30000,
          "mode": "read-only"
        },
        "ai.quickdeploy.codegen/source": {
          "uri": "https://raw.githubusercontent.com/hellosign/hellosign-openapi/31136f9035133acb5f055a94f24e006857210fdb/openapi.yaml",
          "type": "http",
          "digest": "sha256:2ea3f04008afe945d45ba8a6da41c4f1612cc899ba0c96cf36b4da00ce7419ec",
          "ref": "31136f9035133acb5f055a94f24e006857210fdb",
          "retrievedAt": "2026-07-09",
          "sourceVersion": "hellosign/hellosign-openapi@31136f9035133acb5f055a94f24e006857210fdb:openapi.yaml",
          "notes": [
            "Dropbox's core file-storage API is published only as a Stone spec (https://github.com/dropbox/dropbox-api-spec), not a first-party OpenAPI document.",
            "Dropbox owns Dropbox Sign (formerly HelloSign), which publishes an official first-party OpenAPI 3.0.3 document; this Dropbox-family OpenAPI entry targets that spec.",
            "Official Dropbox Sign OpenAPI repository: https://github.com/hellosign/hellosign-openapi",
            "Pinned source path: openapi.yaml",
            "Pinned commit date: 2026-06-19T06:27:28Z",
            "Pinned Git blob SHA: 2ad008a0af65e267eca61dfe2c7cf75db29f458d",
            "OpenAPI document info: title \"Dropbox Sign API\", version 3.0.0",
            "Verified source SHA-256: 2ea3f04008afe945d45ba8a6da41c4f1612cc899ba0c96cf36b4da00ce7419ec",
            "The committed manifest selects read-only Dropbox Sign signature request list/get operations only."
          ]
        },
        "ai.quickdeploy.codegen/policy": {
          "network": [
            "GET https://raw.githubusercontent.com/hellosign/hellosign-openapi/31136f9035133acb5f055a94f24e006857210fdb/openapi.yaml for source retrieval",
            "GET https://api.hellosign.com/v3/signature_request/list for selected upstream operation",
            "GET https://api.hellosign.com/v3/signature_request/{signature_request_id} for selected upstream operation"
          ],
          "filesystem": [
            "Read committed manifest registry/dropbox/api.mcp.json",
            "Read committed generated test packages/tools/registry-cli/test/generated/openapi/dropbox.test.ts",
            "Read/write gitignored generated project .generated/mcp-codegen/openapi/dropbox/"
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
            "from": "GET /signature_request/list",
            "name": "list_dropbox_sign_signature_requests",
            "deny": false
          },
          {
            "from": "GET /signature_request/{signature_request_id}",
            "name": "get_dropbox_sign_signature_request",
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
        "uri": "https://raw.githubusercontent.com/hellosign/hellosign-openapi/31136f9035133acb5f055a94f24e006857210fdb/openapi.yaml",
        "type": "http",
        "digest": "sha256:2ea3f04008afe945d45ba8a6da41c4f1612cc899ba0c96cf36b4da00ce7419ec",
        "ref": "31136f9035133acb5f055a94f24e006857210fdb",
        "retrievedAt": "2026-07-09",
        "sourceVersion": "hellosign/hellosign-openapi@31136f9035133acb5f055a94f24e006857210fdb:openapi.yaml",
        "notes": [
          "Dropbox's core file-storage API is published only as a Stone spec (https://github.com/dropbox/dropbox-api-spec), not a first-party OpenAPI document.",
          "Dropbox owns Dropbox Sign (formerly HelloSign), which publishes an official first-party OpenAPI 3.0.3 document; this Dropbox-family OpenAPI entry targets that spec.",
          "Official Dropbox Sign OpenAPI repository: https://github.com/hellosign/hellosign-openapi",
          "Pinned source path: openapi.yaml",
          "Pinned commit date: 2026-06-19T06:27:28Z",
          "Pinned Git blob SHA: 2ad008a0af65e267eca61dfe2c7cf75db29f458d",
          "OpenAPI document info: title \"Dropbox Sign API\", version 3.0.0",
          "Verified source SHA-256: 2ea3f04008afe945d45ba8a6da41c4f1612cc899ba0c96cf36b4da00ce7419ec",
          "The committed manifest selects read-only Dropbox Sign signature request list/get operations only."
        ]
      },
      "ai.quickdeploy.codegen/policy": {
        "network": [
          "GET https://raw.githubusercontent.com/hellosign/hellosign-openapi/31136f9035133acb5f055a94f24e006857210fdb/openapi.yaml for source retrieval",
          "GET https://api.hellosign.com/v3/signature_request/list for selected upstream operation",
          "GET https://api.hellosign.com/v3/signature_request/{signature_request_id} for selected upstream operation"
        ],
        "filesystem": [
          "Read committed manifest registry/dropbox/api.mcp.json",
          "Read committed generated test packages/tools/registry-cli/test/generated/openapi/dropbox.test.ts",
          "Read/write gitignored generated project .generated/mcp-codegen/openapi/dropbox/"
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
        "from": "GET /signature_request/list",
        "name": "list_dropbox_sign_signature_requests",
        "deny": false
      },
      {
        "from": "GET /signature_request/{signature_request_id}",
        "name": "get_dropbox_sign_signature_request",
        "deny": false
      }
    ],
    "resources": [],
    "prompts": [],
    "authEnvVars": [
      "DROPBOX_SIGN_ACCESS_TOKEN"
    ],
    "serverEnvVars": [
      "DROPBOX_SIGN_ACCESS_TOKEN"
    ]
  },
});
