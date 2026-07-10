import { describeGeneratedMcpManifest } from "../generated-test-helpers";

describeGeneratedMcpManifest({
  family: "wsdl",
  provider: "netsuite",
  manifestPath: "registry/netsuite/soap.mcp.json",
  manifest: {
    "apiVersion": "quickdeploy.ai/v1",
    "kind": "McpManifest",
    "metadata": {
      "name": "ai.quickdeploy/netsuite",
      "version": "0.1.0",
      "title": "NetSuite",
      "description": "Generated wsdl-2-mcp MCP manifest for NetSuite SuiteTalk SOAP get/search.",
      "labels": [
        "erp",
        "generated",
        "netsuite",
        "soap",
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
        "uri": "https://webservices.netsuite.com/wsdl/v2025_2_0/netsuite.wsdl",
        "digest": "sha256:3ebeaf12bbfc0fb0767d6bd26d6f476d904c5c219849f4e9563094e8a4c98e7c",
        "ref": "v2025_2_0"
      },
      "select": {
        "requests": [
          {
            "method": "SOAP",
            "uriTemplate": "NetSuitePortType/get"
          },
          {
            "method": "SOAP",
            "uriTemplate": "NetSuitePortType/search"
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
            "env": "NETSUITE_EMAIL"
          },
          "passwordFrom": {
            "env": "NETSUITE_PASSWORD"
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
              "description": "Account- and data-center-specific NetSuite SOAP endpoint, e.g. https://<ACCOUNT_ID>.suitetalk.api.netsuite.com/services/NetSuitePort_2025_2."
            },
            "requestTimeoutMs": {
              "type": "number",
              "minimum": 1,
              "description": "Per-request SOAP upstream timeout in milliseconds."
            }
          },
          "required": [
            "endpoint"
          ]
        },
        "defaults": {
          "requestTimeoutMs": 30000
        },
        "ai.quickdeploy.codegen/source": {
          "uri": "https://webservices.netsuite.com/wsdl/v2025_2_0/netsuite.wsdl",
          "type": "http",
          "digest": "sha256:3ebeaf12bbfc0fb0767d6bd26d6f476d904c5c219849f4e9563094e8a4c98e7c",
          "ref": "v2025_2_0",
          "retrievedAt": "2026-07-09",
          "sourceVersion": "v2025_2_0",
          "notes": [
            "Official NetSuite SuiteTalk SOAP WSDL, publicly downloadable without authentication.",
            "v2025_2_0 is the current/final SOAP WSDL version: Oracle has stopped issuing new WSDL versions as of the NetSuite 2026.1 release, with the 2025.2 endpoint remaining supported through the eventual SOAP sunset (2028.2 release).",
            "Verified source SHA-256: 3ebeaf12bbfc0fb0767d6bd26d6f476d904c5c219849f4e9563094e8a4c98e7c, confirmed byte-identical across two separate fetches.",
            "Defines NetSuitePortType with 42 operations; this manifest selects two read-only operations: get (retrieve a record by internal ID/record type) and search (query records), matching the list+get shape used across this project.",
            "NetSuite SOAP endpoints are account- and data-center-specific (no universal public endpoint), so endpoint is a required config field with no default, per the wsdl-2-mcp importer's fixed config schema (endpoint, bindingName, requestTimeoutMs)."
          ]
        },
        "ai.quickdeploy.codegen/policy": {
          "network": [
            "GET https://webservices.netsuite.com/wsdl/v2025_2_0/netsuite.wsdl for source retrieval",
            "POST configured NetSuite SuiteTalk endpoint for NetSuitePortType/get and NetSuitePortType/search"
          ],
          "filesystem": [
            "Read committed manifest registry/netsuite/soap.mcp.json",
            "Read committed generated test packages/tools/registry-cli/test/generated/wsdl/netsuite.test.ts",
            "Read/write gitignored generated project .generated/mcp-codegen/wsdl/netsuite/"
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
            "from": "SOAP NetSuitePortType/get",
            "name": "get_netsuite_record",
            "deny": false
          },
          {
            "from": "SOAP NetSuitePortType/search",
            "name": "search_netsuite_records",
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
        "uri": "https://webservices.netsuite.com/wsdl/v2025_2_0/netsuite.wsdl",
        "type": "http",
        "digest": "sha256:3ebeaf12bbfc0fb0767d6bd26d6f476d904c5c219849f4e9563094e8a4c98e7c",
        "ref": "v2025_2_0",
        "retrievedAt": "2026-07-09",
        "sourceVersion": "v2025_2_0",
        "notes": [
          "Official NetSuite SuiteTalk SOAP WSDL, publicly downloadable without authentication.",
          "v2025_2_0 is the current/final SOAP WSDL version: Oracle has stopped issuing new WSDL versions as of the NetSuite 2026.1 release, with the 2025.2 endpoint remaining supported through the eventual SOAP sunset (2028.2 release).",
          "Verified source SHA-256: 3ebeaf12bbfc0fb0767d6bd26d6f476d904c5c219849f4e9563094e8a4c98e7c, confirmed byte-identical across two separate fetches.",
          "Defines NetSuitePortType with 42 operations; this manifest selects two read-only operations: get (retrieve a record by internal ID/record type) and search (query records), matching the list+get shape used across this project.",
          "NetSuite SOAP endpoints are account- and data-center-specific (no universal public endpoint), so endpoint is a required config field with no default, per the wsdl-2-mcp importer's fixed config schema (endpoint, bindingName, requestTimeoutMs)."
        ]
      },
      "ai.quickdeploy.codegen/policy": {
        "network": [
          "GET https://webservices.netsuite.com/wsdl/v2025_2_0/netsuite.wsdl for source retrieval",
          "POST configured NetSuite SuiteTalk endpoint for NetSuitePortType/get and NetSuitePortType/search"
        ],
        "filesystem": [
          "Read committed manifest registry/netsuite/soap.mcp.json",
          "Read committed generated test packages/tools/registry-cli/test/generated/wsdl/netsuite.test.ts",
          "Read/write gitignored generated project .generated/mcp-codegen/wsdl/netsuite/"
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
        "from": "SOAP NetSuitePortType/get",
        "name": "get_netsuite_record",
        "deny": false
      },
      {
        "from": "SOAP NetSuitePortType/search",
        "name": "search_netsuite_records",
        "deny": false
      }
    ],
    "resources": [],
    "prompts": [],
    "authEnvVars": [
      "NETSUITE_EMAIL",
      "NETSUITE_PASSWORD"
    ],
    "serverEnvVars": [
      "NETSUITE_EMAIL",
      "NETSUITE_PASSWORD",
      "QD_MANIFEST_ENDPOINT"
    ]
  },
});
