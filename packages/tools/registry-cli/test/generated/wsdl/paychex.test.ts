import { describeGeneratedMcpManifest } from "../generated-test-helpers";

describeGeneratedMcpManifest({
  family: "wsdl",
  provider: "paychex",
  manifestPath: "registry/paychex/soap.mcp.json",
  manifest: {
    "apiVersion": "quickdeploy.ai/v1",
    "kind": "McpManifest",
    "metadata": {
      "name": "ai.quickdeploy/paychex",
      "version": "0.1.0",
      "title": "Paychex",
      "description": "Generated Paychex Time Web Services (TWS) read-only SOAP MCP catalog manifest.",
      "labels": [
        "generated",
        "hcm",
        "paychex",
        "payroll",
        "read-only",
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
        "uri": "https://paychex.centralservers.com/service/home/about",
        "digest": "sha256:8c06fad2236f41efa3a918e5536808e93af1796e0fc3719229836329dfae494a",
        "ref": "paychex-tws-docs@2026-07-09"
      },
      "select": {
        "requests": [
          {
            "method": "SOAP",
            "uriTemplate": "TimeWebServices/ExportEmployeeTime"
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
            "env": "PAYCHEX_TWS_USERNAME"
          },
          "passwordFrom": {
            "env": "PAYCHEX_TWS_PASSWORD"
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
              "description": "SOAP endpoint override for the selected Time Web Services (TWS) port."
            },
            "requestTimeoutMs": {
              "type": "number",
              "minimum": 1,
              "description": "Per-request SOAP upstream timeout in milliseconds."
            }
          }
        },
        "defaults": {
          "endpoint": "https://centralservers.com/service/ws-soap/2.0",
          "requestTimeoutMs": 30000
        },
        "ai.quickdeploy.codegen/source": {
          "uri": "https://paychex.centralservers.com/service/home/about",
          "type": "http",
          "digest": "sha256:8c06fad2236f41efa3a918e5536808e93af1796e0fc3719229836329dfae494a",
          "ref": "paychex-tws-docs@2026-07-09",
          "retrievedAt": "2026-07-09",
          "sourceVersion": "paychex-tws-docs@2026-07-09",
          "notes": [
            "Official Paychex Time Web Services (TWS) documentation: https://paychex.centralservers.com/service/home/about",
            "Paychex's modern developer.paychex.com portal is REST-only; the genuine SOAP surface is the legacy Time Web Services (TWS) API for the Stratustime time & attendance engine, exposed at https://centralservers.com/service/ws-soap/2.0 (and a ws-soap/1.0 fallback), alongside XML/JSON variants of the same interface.",
            "Verified source SHA-256: 8c06fad2236f41efa3a918e5536808e93af1796e0fc3719229836329dfae494a",
            "Per-operation request/response schemas are exposed through TWS's authenticated interactive library interface rather than a statically downloadable WSDL; the selected operation models Paychex's officially documented read-only employee time-export capability. This mirrors the per-tenant endpoint placeholder precedent set by the merged Workday manifest (registry/workday/soap.mcp.json).",
            "This is a read-only export operation only: no time punches, employee records, or payroll data are mutated."
          ]
        },
        "ai.quickdeploy.codegen/policy": {
          "network": [
            "GET https://paychex.centralservers.com/service/home/about for source retrieval",
            "SOAP TimeWebServices/ExportEmployeeTime for selected upstream operation"
          ],
          "filesystem": [
            "Read committed manifest registry/paychex/soap.mcp.json",
            "Read committed generated test packages/tools/registry-cli/test/generated/wsdl/paychex.test.ts",
            "Read/write gitignored generated project .generated/mcp-codegen/wsdl/paychex/"
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
            "from": "SOAP TimeWebServices/ExportEmployeeTime",
            "name": "soap_paychex_export_employee_time",
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
        "uri": "https://paychex.centralservers.com/service/home/about",
        "type": "http",
        "digest": "sha256:8c06fad2236f41efa3a918e5536808e93af1796e0fc3719229836329dfae494a",
        "ref": "paychex-tws-docs@2026-07-09",
        "retrievedAt": "2026-07-09",
        "sourceVersion": "paychex-tws-docs@2026-07-09",
        "notes": [
          "Official Paychex Time Web Services (TWS) documentation: https://paychex.centralservers.com/service/home/about",
          "Paychex's modern developer.paychex.com portal is REST-only; the genuine SOAP surface is the legacy Time Web Services (TWS) API for the Stratustime time & attendance engine, exposed at https://centralservers.com/service/ws-soap/2.0 (and a ws-soap/1.0 fallback), alongside XML/JSON variants of the same interface.",
          "Verified source SHA-256: 8c06fad2236f41efa3a918e5536808e93af1796e0fc3719229836329dfae494a",
          "Per-operation request/response schemas are exposed through TWS's authenticated interactive library interface rather than a statically downloadable WSDL; the selected operation models Paychex's officially documented read-only employee time-export capability. This mirrors the per-tenant endpoint placeholder precedent set by the merged Workday manifest (registry/workday/soap.mcp.json).",
          "This is a read-only export operation only: no time punches, employee records, or payroll data are mutated."
        ]
      },
      "ai.quickdeploy.codegen/policy": {
        "network": [
          "GET https://paychex.centralservers.com/service/home/about for source retrieval",
          "SOAP TimeWebServices/ExportEmployeeTime for selected upstream operation"
        ],
        "filesystem": [
          "Read committed manifest registry/paychex/soap.mcp.json",
          "Read committed generated test packages/tools/registry-cli/test/generated/wsdl/paychex.test.ts",
          "Read/write gitignored generated project .generated/mcp-codegen/wsdl/paychex/"
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
        "from": "SOAP TimeWebServices/ExportEmployeeTime",
        "name": "soap_paychex_export_employee_time",
        "deny": false
      }
    ],
    "resources": [],
    "prompts": [],
    "authEnvVars": [
      "PAYCHEX_TWS_PASSWORD",
      "PAYCHEX_TWS_USERNAME"
    ],
    "serverEnvVars": [
      "PAYCHEX_TWS_PASSWORD",
      "PAYCHEX_TWS_USERNAME"
    ]
  },
});
