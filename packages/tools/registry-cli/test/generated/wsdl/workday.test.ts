import { describeGeneratedMcpManifest } from "../generated-test-helpers";

describeGeneratedMcpManifest({
  family: "wsdl",
  provider: "workday",
  manifestPath: "registry/workday/soap.mcp.json",
  manifest: {
    "apiVersion": "quickdeploy.ai/v1",
    "kind": "McpManifest",
    "metadata": {
      "name": "ai.quickdeploy/workday",
      "version": "0.1.0",
      "title": "Workday",
      "description": "Generated Workday Human Resources SOAP web service MCP catalog manifest.",
      "labels": [
        "generated",
        "hcm",
        "human-resources",
        "read-only",
        "soap",
        "workday",
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
        "uri": "https://community.workday.com/sites/default/files/file-hosting/productionapi/index.html"
      },
      "select": {
        "requests": [
          {
            "method": "SOAP",
            "uriTemplate": "Human_Resources/Get_Workers"
          },
          {
            "method": "SOAP",
            "uriTemplate": "Human_Resources/Get_Organizations"
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
            "env": "WORKDAY_USERNAME"
          },
          "passwordFrom": {
            "env": "WORKDAY_PASSWORD"
          }
        }
      ],
      "config": {
        "schema": {
          "type": "object",
          "properties": {
            "endpoint": {
              "type": "string",
              "format": "uri",
              "description": "SOAP endpoint override for the selected WSDL service port."
            },
            "requestTimeoutMs": {
              "type": "number",
              "minimum": 1,
              "description": "Per-request SOAP upstream timeout in milliseconds."
            }
          }
        },
        "defaults": {
          "endpoint": "https://wd2-impl-services1.workday.com/ccx/service/example-tenant/Human_Resources/v46.1",
          "requestTimeoutMs": 30000
        },
        "ai.quickdeploy.codegen/source": {
          "uri": "https://community.workday.com/sites/default/files/file-hosting/productionapi/index.html",
          "type": "http",
          "retrievedAt": "2026-07-09",
          "sourceVersion": "workday-wws-v46.1-2026R1",
          "notes": [
            "Official Workday Web Services (WWS) directory: https://community.workday.com/sites/default/files/file-hosting/productionapi/index.html",
            "SOAP API reference overview: https://community-content.workday.com/en-us/public/products/platform-and-product-extensions/soap-api-reference.html",
            "Directory version v46.1 (2026R1), last updated 2026/05/29.",
            "The committed manifest selects a read-only, representative subset of the Human Resources web service: Get_Workers and Get_Organizations.",
            "Workday SOAP endpoints are per-tenant (https://<host>/ccx/service/<tenant>/Human_Resources/v46.1); the committed config.defaults.endpoint is a placeholder illustrating the WSDL-documented endpoint shape, not a live tenant URL.",
            "Workday authenticates SOAP calls via WS-Security UsernameToken (tenant username/password) or an ISU integration system user; this manifest models it as basic auth env refs."
          ]
        },
        "ai.quickdeploy.codegen/policy": {
          "network": [
            "GET https://community.workday.com/sites/default/files/file-hosting/productionapi/index.html for source retrieval",
            "SOAP Human_Resources/Get_Workers for selected upstream operation",
            "SOAP Human_Resources/Get_Organizations for selected upstream operation"
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
            "from": "SOAP Human_Resources/Get_Workers",
            "name": "soap_human_resources_get_workers",
            "deny": false
          },
          {
            "from": "SOAP Human_Resources/Get_Organizations",
            "name": "soap_human_resources_get_organizations",
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
        "uri": "https://community.workday.com/sites/default/files/file-hosting/productionapi/index.html",
        "type": "http",
        "retrievedAt": "2026-07-09",
        "sourceVersion": "workday-wws-v46.1-2026R1",
        "notes": [
          "Official Workday Web Services (WWS) directory: https://community.workday.com/sites/default/files/file-hosting/productionapi/index.html",
          "SOAP API reference overview: https://community-content.workday.com/en-us/public/products/platform-and-product-extensions/soap-api-reference.html",
          "Directory version v46.1 (2026R1), last updated 2026/05/29.",
          "The committed manifest selects a read-only, representative subset of the Human Resources web service: Get_Workers and Get_Organizations.",
          "Workday SOAP endpoints are per-tenant (https://<host>/ccx/service/<tenant>/Human_Resources/v46.1); the committed config.defaults.endpoint is a placeholder illustrating the WSDL-documented endpoint shape, not a live tenant URL.",
          "Workday authenticates SOAP calls via WS-Security UsernameToken (tenant username/password) or an ISU integration system user; this manifest models it as basic auth env refs."
        ]
      },
      "ai.quickdeploy.codegen/policy": {
        "network": [
          "GET https://community.workday.com/sites/default/files/file-hosting/productionapi/index.html for source retrieval",
          "SOAP Human_Resources/Get_Workers for selected upstream operation",
          "SOAP Human_Resources/Get_Organizations for selected upstream operation"
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
  },
  expected: {
    "tools": [
      {
        "from": "SOAP Human_Resources/Get_Workers",
        "name": "soap_human_resources_get_workers",
        "deny": false
      },
      {
        "from": "SOAP Human_Resources/Get_Organizations",
        "name": "soap_human_resources_get_organizations",
        "deny": false
      }
    ],
    "resources": [],
    "prompts": [],
    "authEnvVars": [
      "WORKDAY_PASSWORD",
      "WORKDAY_USERNAME"
    ],
    "serverEnvVars": [
      "WORKDAY_PASSWORD",
      "WORKDAY_USERNAME"
    ]
  },
});
