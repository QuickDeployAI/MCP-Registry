import { describeGeneratedMcpManifest } from "../generated-test-helpers";

describeGeneratedMcpManifest({
  family: "openapi",
  provider: "quickbooks-online",
  manifestPath: "registry/quickbooks-online/api.mcp.json",
  manifest: {
    "apiVersion": "quickdeploy.ai/v1",
    "kind": "McpManifest",
    "metadata": {
      "name": "ai.quickdeploy/quickbooks-online",
      "version": "0.1.0",
      "title": "QuickBooks Online",
      "description": "Generated QuickBooks Online Accounting read-only OpenAPI MCP catalog manifest.",
      "labels": [
        "accounting",
        "generated",
        "openapi",
        "quickbooks-online",
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
        "uri": "https://developer.intuit.com/app/developer/qbo/docs/api/accounting/most-commonly-used/account",
        "ref": "quickbooks-online-accounting-api-docs@2026-07-10"
      },
      "select": {
        "requests": [
          {
            "method": "GET",
            "uriTemplate": "/v3/company/{realmId}/query"
          },
          {
            "method": "GET",
            "uriTemplate": "/v3/company/{realmId}/account/{Id}"
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
            "env": "QUICKBOOKS_ONLINE_ACCESS_TOKEN"
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
              "description": "QuickBooks Online Accounting API base URL."
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
          "baseUrl": "https://quickbooks.api.intuit.com",
          "requestTimeoutMs": 30000,
          "mode": "read-only"
        },
        "ai.quickdeploy.codegen/source": {
          "uri": "https://developer.intuit.com/app/developer/qbo/docs/api/accounting/most-commonly-used/account",
          "type": "http",
          "ref": "quickbooks-online-accounting-api-docs@2026-07-10",
          "retrievedAt": "2026-07-10",
          "sourceVersion": "quickbooks-online-accounting-api-docs@2026-07-10",
          "notes": [
            "Intuit explicitly states no official OpenAPI/Swagger specification is published for the QuickBooks Online Accounting API (confirmed via Intuit Developer Support: https://help.developer.intuit.com/s/article/Open-API-docs-Swagger-docs).",
            "This manifest pins the official Intuit Developer reference documentation page for the most-commonly-used Account entity, matching the Salesforce/Airtable/HubSpot precedent (QUI-351/QUI-352/QUI-366) for providers without a first-party machine-readable spec.",
            "Canonical source URL: https://developer.intuit.com/app/developer/qbo/docs/api/accounting/most-commonly-used/account",
            "No content digest is pinned: the Intuit Developer portal serves this page as a client-rendered single-page-app shell, verified by direct fetch to differ by a few dynamic bytes (embedded feature-flag/session state) across two separate fetches on 2026-07-10, so a fixed SHA-256 of the raw HTML would not be reproducible or meaningful provenance, unlike a static spec document. retrievedAt/sourceVersion record when and how the endpoint was verified instead.",
            "Selected operations model the QuickBooks Online v3 REST API's read-only entity query and single-entity-get shape for the Account entity: GET /v3/company/{realmId}/query (SQL-like SELECT, e.g. `select * from Account`, per https://developer.intuit.com/app/developer/qbo/docs/develop/explore-the-quickbooks-online-api/data-queries) and GET /v3/company/{realmId}/account/{Id}.",
            "{realmId} is the QuickBooks Online company ID, supplied per-request/per-tool-call like Airtable's {baseId} and Zendesk's subdomain-scoped baseUrl; it is not a manifest config field."
          ]
        },
        "ai.quickdeploy.codegen/policy": {
          "network": [
            "GET https://developer.intuit.com/app/developer/qbo/docs/api/accounting/most-commonly-used/account for source retrieval",
            "GET https://quickbooks.api.intuit.com/v3/company/{realmId}/query for selected upstream operation",
            "GET https://quickbooks.api.intuit.com/v3/company/{realmId}/account/{Id} for selected upstream operation"
          ],
          "filesystem": [
            "Read committed manifest registry/quickbooks-online/api.mcp.json",
            "Read committed generated test packages/tools/registry-cli/test/generated/openapi/quickbooks-online.test.ts",
            "Read/write gitignored generated project .generated/mcp-codegen/openapi/quickbooks-online/"
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
            "from": "GET /v3/company/{realmId}/query",
            "name": "list_quickbooks_online_accounts",
            "deny": false
          },
          {
            "from": "GET /v3/company/{realmId}/account/{Id}",
            "name": "get_quickbooks_online_account",
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
        "uri": "https://developer.intuit.com/app/developer/qbo/docs/api/accounting/most-commonly-used/account",
        "type": "http",
        "ref": "quickbooks-online-accounting-api-docs@2026-07-10",
        "retrievedAt": "2026-07-10",
        "sourceVersion": "quickbooks-online-accounting-api-docs@2026-07-10",
        "notes": [
          "Intuit explicitly states no official OpenAPI/Swagger specification is published for the QuickBooks Online Accounting API (confirmed via Intuit Developer Support: https://help.developer.intuit.com/s/article/Open-API-docs-Swagger-docs).",
          "This manifest pins the official Intuit Developer reference documentation page for the most-commonly-used Account entity, matching the Salesforce/Airtable/HubSpot precedent (QUI-351/QUI-352/QUI-366) for providers without a first-party machine-readable spec.",
          "Canonical source URL: https://developer.intuit.com/app/developer/qbo/docs/api/accounting/most-commonly-used/account",
          "No content digest is pinned: the Intuit Developer portal serves this page as a client-rendered single-page-app shell, verified by direct fetch to differ by a few dynamic bytes (embedded feature-flag/session state) across two separate fetches on 2026-07-10, so a fixed SHA-256 of the raw HTML would not be reproducible or meaningful provenance, unlike a static spec document. retrievedAt/sourceVersion record when and how the endpoint was verified instead.",
          "Selected operations model the QuickBooks Online v3 REST API's read-only entity query and single-entity-get shape for the Account entity: GET /v3/company/{realmId}/query (SQL-like SELECT, e.g. `select * from Account`, per https://developer.intuit.com/app/developer/qbo/docs/develop/explore-the-quickbooks-online-api/data-queries) and GET /v3/company/{realmId}/account/{Id}.",
          "{realmId} is the QuickBooks Online company ID, supplied per-request/per-tool-call like Airtable's {baseId} and Zendesk's subdomain-scoped baseUrl; it is not a manifest config field."
        ]
      },
      "ai.quickdeploy.codegen/policy": {
        "network": [
          "GET https://developer.intuit.com/app/developer/qbo/docs/api/accounting/most-commonly-used/account for source retrieval",
          "GET https://quickbooks.api.intuit.com/v3/company/{realmId}/query for selected upstream operation",
          "GET https://quickbooks.api.intuit.com/v3/company/{realmId}/account/{Id} for selected upstream operation"
        ],
        "filesystem": [
          "Read committed manifest registry/quickbooks-online/api.mcp.json",
          "Read committed generated test packages/tools/registry-cli/test/generated/openapi/quickbooks-online.test.ts",
          "Read/write gitignored generated project .generated/mcp-codegen/openapi/quickbooks-online/"
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
        "from": "GET /v3/company/{realmId}/query",
        "name": "list_quickbooks_online_accounts",
        "deny": false
      },
      {
        "from": "GET /v3/company/{realmId}/account/{Id}",
        "name": "get_quickbooks_online_account",
        "deny": false
      }
    ],
    "resources": [],
    "prompts": [],
    "authEnvVars": [
      "QUICKBOOKS_ONLINE_ACCESS_TOKEN"
    ],
    "serverEnvVars": [
      "QUICKBOOKS_ONLINE_ACCESS_TOKEN"
    ]
  },
});
