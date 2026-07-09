import { describeGeneratedMcpManifest } from "../generated-test-helpers";

describeGeneratedMcpManifest({
  family: "wsdl",
  provider: "acme-soap",
  manifestPath: "registry/acme-soap/wsdl.mcp.json",
  manifest: {
    "apiVersion": "quickdeploy.ai/v1",
    "kind": "McpManifest",
    "metadata": {
      "name": "ai.quickdeploy/acme-soap",
      "version": "0.1.0",
      "title": "Acme Soap",
      "description": "Generated wsdl-2-mcp MCP manifest for Acme Soap.",
      "labels": [
        "acme-soap",
        "generated",
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
        "uri": "https://soap.example.test/service.wsdl"
      },
      "select": {
        "requests": [
          {
            "method": "SOAP",
            "uriTemplate": "Calculator/Add"
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
            "env": "ACME_SOAP_USERNAME"
          },
          "passwordFrom": {
            "env": "ACME_SOAP_PASSWORD"
          }
        }
      ],
      "config": {
        "schema": {
          "type": "object",
          "properties": {
            "endpoint": {
              "type": "string"
            }
          }
        },
        "defaults": {
          "endpoint": "https://soap.example.test/service"
        },
        "ai.quickdeploy.codegen/source": {
          "uri": "https://soap.example.test/service.wsdl",
          "type": "http",
          "retrievedAt": "2026-07-09",
          "sourceVersion": "service-v3"
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
            "from": "SOAP Calculator/Add",
            "name": "soap_calculator_add",
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
        "uri": "https://soap.example.test/service.wsdl",
        "type": "http",
        "retrievedAt": "2026-07-09",
        "sourceVersion": "service-v3"
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
        "from": "SOAP Calculator/Add",
        "name": "soap_calculator_add",
        "deny": false
      }
    ],
    "resources": [],
    "prompts": [],
    "authEnvVars": [
      "ACME_SOAP_PASSWORD",
      "ACME_SOAP_USERNAME"
    ],
    "serverEnvVars": [
      "ACME_SOAP_PASSWORD",
      "ACME_SOAP_USERNAME"
    ]
  },
});
