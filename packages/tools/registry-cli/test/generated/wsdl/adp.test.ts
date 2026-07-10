import { describeGeneratedMcpManifest } from "../generated-test-helpers";

describeGeneratedMcpManifest({
  family: "wsdl",
  provider: "adp",
  manifestPath: "registry/adp/soap.mcp.json",
  manifest: {
    "apiVersion": "quickdeploy.ai/v1",
    "kind": "McpManifest",
    "metadata": {
      "name": "ai.quickdeploy/adp",
      "version": "0.1.0",
      "title": "ADP",
      "description": "Generated wsdl-2-mcp MCP manifest for ADP legacy payroll/HR SOAP services.",
      "labels": [
        "adp",
        "generated",
        "hr",
        "payroll",
        "read-only",
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
        "uri": "https://developers.adp.com/",
        "digest": "sha256:37f88fab9764e0af8e14ad253f07dbe4c7e8ada4933f2d64d615fe82046ce663",
        "ref": "adp-developer-resources@2026-07-09"
      },
      "select": {
        "requests": [
          {
            "method": "SOAP",
            "uriTemplate": "Worker/GetList"
          },
          {
            "method": "SOAP",
            "uriTemplate": "Worker/GetDetails"
          },
          {
            "method": "SOAP",
            "uriTemplate": "PayrollOutput/GetStatus"
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
            "env": "ADP_USERNAME"
          },
          "passwordFrom": {
            "env": "ADP_PASSWORD"
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
              "description": "SOAP endpoint override for the selected WSDL service port (customer-specific ADP integration endpoint)."
            },
            "bindingName": {
              "type": "string",
              "description": "Optional WSDL binding name when a document exposes multiple SOAP bindings."
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
          "uri": "https://developers.adp.com/",
          "type": "http",
          "digest": "sha256:37f88fab9764e0af8e14ad253f07dbe4c7e8ada4933f2d64d615fe82046ce663",
          "ref": "adp-developer-resources@2026-07-09",
          "retrievedAt": "2026-07-09",
          "sourceVersion": "adp-developer-resources@2026-07-09",
          "notes": [
            "Official ADP Developer Resources portal (developers.adp.com) — ADP's current public developer documentation, which is REST/OAuth2-based.",
            "ADP does not publish a first-party public WSDL/SOAP specification; ADP's REST APIs superseded the legacy SOAP-based Enterprise/GlobalView payroll and worker integration services this manifest models.",
            "Selected operations model ADP's standard Worker and Payroll Output integration concepts (the same canonical Worker entity ADP's current REST HR API exposes at /hr/v2/workers) as historically exposed via SOAP for ADP Enterprise/GlobalView customers.",
            "Canonical discovery URL: https://developers.adp.com/",
            "Verified source SHA-256: 37f88fab9764e0af8e14ad253f07dbe4c7e8ada4933f2d64d615fe82046ce663",
            "This manifest selects read-only worker and payroll status lookups only; no create/update operations are exposed."
          ]
        },
        "ai.quickdeploy.codegen/policy": {
          "network": [
            "source-uri",
            "configured-upstream"
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
            "from": "SOAP Worker/GetList",
            "name": "adp_worker_get_list",
            "deny": false
          },
          {
            "from": "SOAP Worker/GetDetails",
            "name": "adp_worker_get_details",
            "deny": false
          },
          {
            "from": "SOAP PayrollOutput/GetStatus",
            "name": "adp_payroll_output_get_status",
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
        "uri": "https://developers.adp.com/",
        "type": "http",
        "digest": "sha256:37f88fab9764e0af8e14ad253f07dbe4c7e8ada4933f2d64d615fe82046ce663",
        "ref": "adp-developer-resources@2026-07-09",
        "retrievedAt": "2026-07-09",
        "sourceVersion": "adp-developer-resources@2026-07-09",
        "notes": [
          "Official ADP Developer Resources portal (developers.adp.com) — ADP's current public developer documentation, which is REST/OAuth2-based.",
          "ADP does not publish a first-party public WSDL/SOAP specification; ADP's REST APIs superseded the legacy SOAP-based Enterprise/GlobalView payroll and worker integration services this manifest models.",
          "Selected operations model ADP's standard Worker and Payroll Output integration concepts (the same canonical Worker entity ADP's current REST HR API exposes at /hr/v2/workers) as historically exposed via SOAP for ADP Enterprise/GlobalView customers.",
          "Canonical discovery URL: https://developers.adp.com/",
          "Verified source SHA-256: 37f88fab9764e0af8e14ad253f07dbe4c7e8ada4933f2d64d615fe82046ce663",
          "This manifest selects read-only worker and payroll status lookups only; no create/update operations are exposed."
        ]
      },
      "ai.quickdeploy.codegen/policy": {
        "network": [
          "source-uri",
          "configured-upstream"
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
        "from": "SOAP Worker/GetList",
        "name": "adp_worker_get_list",
        "deny": false
      },
      {
        "from": "SOAP Worker/GetDetails",
        "name": "adp_worker_get_details",
        "deny": false
      },
      {
        "from": "SOAP PayrollOutput/GetStatus",
        "name": "adp_payroll_output_get_status",
        "deny": false
      }
    ],
    "resources": [],
    "prompts": [],
    "authEnvVars": [
      "ADP_PASSWORD",
      "ADP_USERNAME"
    ],
    "serverEnvVars": [
      "ADP_PASSWORD",
      "ADP_USERNAME",
      "QD_MANIFEST_ENDPOINT"
    ]
  },
});
