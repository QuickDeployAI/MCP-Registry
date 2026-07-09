import { describeGeneratedMcpManifest } from "../generated-test-helpers";

describeGeneratedMcpManifest({
  family: "openapi",
  provider: "hubspot",
  manifestPath: "registry/hubspot/api.mcp.json",
  manifest: {
    "apiVersion": "quickdeploy.ai/v1",
    "kind": "McpManifest",
    "metadata": {
      "name": "ai.quickdeploy/hubspot",
      "version": "0.1.0",
      "title": "HubSpot",
      "description": "Generated HubSpot CRM Objects read-only OpenAPI MCP catalog manifest.",
      "labels": [
        "crm",
        "generated",
        "hubspot",
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
        "uri": "https://raw.githubusercontent.com/HubSpot/HubSpot-public-api-spec-collection/e787dafc569a1f3fdd237f59dd7fb9eec395034c/PublicApiSpecs/CRM/Objects/Rollouts/424/v3/objects.json",
        "digest": "sha256:9bdc858c65939bb9b5f604becd9b198afc42663f1449747db8b61c9ec29e6022",
        "ref": "e787dafc569a1f3fdd237f59dd7fb9eec395034c"
      },
      "select": {
        "requests": [
          {
            "method": "GET",
            "uriTemplate": "/crm/v3/objects/{objectType}"
          },
          {
            "method": "GET",
            "uriTemplate": "/crm/v3/objects/{objectType}/{objectId}"
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
            "env": "HUBSPOT_ACCESS_TOKEN"
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
              "description": "HubSpot API base URL."
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
          "baseUrl": "https://api.hubapi.com",
          "requestTimeoutMs": 30000,
          "mode": "read-only"
        },
        "ai.quickdeploy.codegen/source": {
          "uri": "https://raw.githubusercontent.com/HubSpot/HubSpot-public-api-spec-collection/e787dafc569a1f3fdd237f59dd7fb9eec395034c/PublicApiSpecs/CRM/Objects/Rollouts/424/v3/objects.json",
          "type": "http",
          "digest": "sha256:9bdc858c65939bb9b5f604becd9b198afc42663f1449747db8b61c9ec29e6022",
          "ref": "e787dafc569a1f3fdd237f59dd7fb9eec395034c",
          "retrievedAt": "2026-07-09",
          "sourceVersion": "HubSpot/HubSpot-public-api-spec-collection@e787dafc569a1f3fdd237f59dd7fb9eec395034c:PublicApiSpecs/CRM/Objects/Rollouts/424/v3/objects.json",
          "notes": [
            "Official HubSpot public API spec repository: https://github.com/HubSpot/HubSpot-public-api-spec-collection",
            "Pinned source path: PublicApiSpecs/CRM/Objects/Rollouts/424/v3/objects.json",
            "Pinned commit date: 2026-07-08T08:21:59Z",
            "Pinned Git blob SHA: be73c00f9829fbd7d20145dcf82810cb3a1dd418",
            "Verified source SHA-256: 9bdc858c65939bb9b5f604becd9b198afc42663f1449747db8b61c9ec29e6022",
            "The committed manifest selects read-only HubSpot CRM Objects v3 GET operations only."
          ]
        },
        "ai.quickdeploy.codegen/policy": {
          "network": [
            "GET https://raw.githubusercontent.com/HubSpot/HubSpot-public-api-spec-collection/e787dafc569a1f3fdd237f59dd7fb9eec395034c/PublicApiSpecs/CRM/Objects/Rollouts/424/v3/objects.json for source retrieval",
            "GET https://api.hubapi.com/crm/v3/objects/{objectType} for selected upstream operation",
            "GET https://api.hubapi.com/crm/v3/objects/{objectType}/{objectId} for selected upstream operation"
          ],
          "filesystem": [
            "Read committed manifest registry/hubspot/api.mcp.json",
            "Read committed generated test packages/tools/registry-cli/test/generated/openapi/hubspot.test.ts",
            "Read/write gitignored generated project .generated/mcp-codegen/openapi/hubspot/"
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
            "from": "GET /crm/v3/objects/{objectType}",
            "name": "list_crm_objects",
            "deny": false
          },
          {
            "from": "GET /crm/v3/objects/{objectType}/{objectId}",
            "name": "get_crm_object",
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
        "uri": "https://raw.githubusercontent.com/HubSpot/HubSpot-public-api-spec-collection/e787dafc569a1f3fdd237f59dd7fb9eec395034c/PublicApiSpecs/CRM/Objects/Rollouts/424/v3/objects.json",
        "type": "http",
        "digest": "sha256:9bdc858c65939bb9b5f604becd9b198afc42663f1449747db8b61c9ec29e6022",
        "ref": "e787dafc569a1f3fdd237f59dd7fb9eec395034c",
        "retrievedAt": "2026-07-09",
        "sourceVersion": "HubSpot/HubSpot-public-api-spec-collection@e787dafc569a1f3fdd237f59dd7fb9eec395034c:PublicApiSpecs/CRM/Objects/Rollouts/424/v3/objects.json",
        "notes": [
          "Official HubSpot public API spec repository: https://github.com/HubSpot/HubSpot-public-api-spec-collection",
          "Pinned source path: PublicApiSpecs/CRM/Objects/Rollouts/424/v3/objects.json",
          "Pinned commit date: 2026-07-08T08:21:59Z",
          "Pinned Git blob SHA: be73c00f9829fbd7d20145dcf82810cb3a1dd418",
          "Verified source SHA-256: 9bdc858c65939bb9b5f604becd9b198afc42663f1449747db8b61c9ec29e6022",
          "The committed manifest selects read-only HubSpot CRM Objects v3 GET operations only."
        ]
      },
      "ai.quickdeploy.codegen/policy": {
        "network": [
          "GET https://raw.githubusercontent.com/HubSpot/HubSpot-public-api-spec-collection/e787dafc569a1f3fdd237f59dd7fb9eec395034c/PublicApiSpecs/CRM/Objects/Rollouts/424/v3/objects.json for source retrieval",
          "GET https://api.hubapi.com/crm/v3/objects/{objectType} for selected upstream operation",
          "GET https://api.hubapi.com/crm/v3/objects/{objectType}/{objectId} for selected upstream operation"
        ],
        "filesystem": [
          "Read committed manifest registry/hubspot/api.mcp.json",
          "Read committed generated test packages/tools/registry-cli/test/generated/openapi/hubspot.test.ts",
          "Read/write gitignored generated project .generated/mcp-codegen/openapi/hubspot/"
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
        "from": "GET /crm/v3/objects/{objectType}",
        "name": "list_crm_objects",
        "deny": false
      },
      {
        "from": "GET /crm/v3/objects/{objectType}/{objectId}",
        "name": "get_crm_object",
        "deny": false
      }
    ],
    "resources": [],
    "prompts": [],
    "authEnvVars": [
      "HUBSPOT_ACCESS_TOKEN"
    ],
    "serverEnvVars": [
      "HUBSPOT_ACCESS_TOKEN"
    ]
  },
});
