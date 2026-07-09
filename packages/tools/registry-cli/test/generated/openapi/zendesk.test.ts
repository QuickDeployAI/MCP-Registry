import { describeGeneratedMcpManifest } from "../generated-test-helpers";

describeGeneratedMcpManifest({
  family: "openapi",
  provider: "zendesk",
  manifestPath: "registry/zendesk/api.mcp.json",
  manifest: {
    "apiVersion": "quickdeploy.ai/v1",
    "kind": "McpManifest",
    "metadata": {
      "name": "ai.quickdeploy/zendesk",
      "version": "0.1.0",
      "title": "Zendesk",
      "description": "Generated Zendesk Support Tickets read-only OpenAPI MCP catalog manifest.",
      "labels": [
        "generated",
        "openapi",
        "read-only",
        "support",
        "zendesk"
      ]
    },
    "spec": {
      "importer": {
        "engine": "openapi-2-mcp",
        "versionRange": "^0.1.0"
      },
      "source": {
        "type": "http",
        "uri": "https://developer.zendesk.com/zendesk/oas.yaml",
        "digest": "sha256:97000e656ca5e125c66492f0a237d8963cd80bdf35003155292b783a4f189f6e",
        "ref": "zendesk-support-api-oas@2.0.0"
      },
      "select": {
        "requests": [
          {
            "method": "GET",
            "uriTemplate": "/api/v2/tickets"
          },
          {
            "method": "GET",
            "uriTemplate": "/api/v2/tickets/{ticket_id}"
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
            "env": "ZENDESK_API_EMAIL"
          },
          "passwordFrom": {
            "env": "ZENDESK_API_TOKEN"
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
              "description": "Zendesk account base URL, e.g. https://{subdomain}.zendesk.com."
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
          },
          "required": [
            "baseUrl"
          ]
        },
        "defaults": {
          "requestTimeoutMs": 30000,
          "mode": "read-only"
        },
        "ai.quickdeploy.codegen/source": {
          "uri": "https://developer.zendesk.com/zendesk/oas.yaml",
          "type": "http",
          "digest": "sha256:97000e656ca5e125c66492f0a237d8963cd80bdf35003155292b783a4f189f6e",
          "ref": "zendesk-support-api-oas@2.0.0",
          "retrievedAt": "2026-07-09",
          "sourceVersion": "zendesk-support-api-oas@2.0.0",
          "notes": [
            "Official Zendesk Developer Docs OpenAPI download for the Support (Ticketing) API: https://developer.zendesk.com/api-reference/ticketing/introduction/",
            "Canonical source URL: https://developer.zendesk.com/zendesk/oas.yaml",
            "Document info: title \"Support API\", version 2.0.0.",
            "Upstream Last-Modified: Wed, 08 Jul 2026 08:11:23 GMT.",
            "Verified source SHA-256: 97000e656ca5e125c66492f0a237d8963cd80bdf35003155292b783a4f189f6e",
            "The committed manifest selects read-only Zendesk Support ticket list/get operations only."
          ]
        },
        "ai.quickdeploy.codegen/policy": {
          "network": [
            "GET https://developer.zendesk.com/zendesk/oas.yaml for source retrieval",
            "GET https://<zendesk-subdomain>.zendesk.com/api/v2/tickets for selected upstream operation",
            "GET https://<zendesk-subdomain>.zendesk.com/api/v2/tickets/{ticket_id} for selected upstream operation"
          ],
          "filesystem": [
            "Read committed manifest registry/zendesk/api.mcp.json",
            "Read committed generated test packages/tools/registry-cli/test/generated/openapi/zendesk.test.ts",
            "Read/write gitignored generated project .generated/mcp-codegen/openapi/zendesk/"
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
            "from": "GET /api/v2/tickets",
            "name": "list_zendesk_tickets",
            "deny": false
          },
          {
            "from": "GET /api/v2/tickets/{ticket_id}",
            "name": "get_zendesk_ticket",
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
        "uri": "https://developer.zendesk.com/zendesk/oas.yaml",
        "type": "http",
        "digest": "sha256:97000e656ca5e125c66492f0a237d8963cd80bdf35003155292b783a4f189f6e",
        "ref": "zendesk-support-api-oas@2.0.0",
        "retrievedAt": "2026-07-09",
        "sourceVersion": "zendesk-support-api-oas@2.0.0",
        "notes": [
          "Official Zendesk Developer Docs OpenAPI download for the Support (Ticketing) API: https://developer.zendesk.com/api-reference/ticketing/introduction/",
          "Canonical source URL: https://developer.zendesk.com/zendesk/oas.yaml",
          "Document info: title \"Support API\", version 2.0.0.",
          "Upstream Last-Modified: Wed, 08 Jul 2026 08:11:23 GMT.",
          "Verified source SHA-256: 97000e656ca5e125c66492f0a237d8963cd80bdf35003155292b783a4f189f6e",
          "The committed manifest selects read-only Zendesk Support ticket list/get operations only."
        ]
      },
      "ai.quickdeploy.codegen/policy": {
        "network": [
          "GET https://developer.zendesk.com/zendesk/oas.yaml for source retrieval",
          "GET https://<zendesk-subdomain>.zendesk.com/api/v2/tickets for selected upstream operation",
          "GET https://<zendesk-subdomain>.zendesk.com/api/v2/tickets/{ticket_id} for selected upstream operation"
        ],
        "filesystem": [
          "Read committed manifest registry/zendesk/api.mcp.json",
          "Read committed generated test packages/tools/registry-cli/test/generated/openapi/zendesk.test.ts",
          "Read/write gitignored generated project .generated/mcp-codegen/openapi/zendesk/"
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
        "from": "GET /api/v2/tickets",
        "name": "list_zendesk_tickets",
        "deny": false
      },
      {
        "from": "GET /api/v2/tickets/{ticket_id}",
        "name": "get_zendesk_ticket",
        "deny": false
      }
    ],
    "resources": [],
    "prompts": [],
    "authEnvVars": [
      "ZENDESK_API_EMAIL",
      "ZENDESK_API_TOKEN"
    ],
    "serverEnvVars": [
      "QD_MANIFEST_BASE_URL",
      "ZENDESK_API_EMAIL",
      "ZENDESK_API_TOKEN"
    ]
  },
});
