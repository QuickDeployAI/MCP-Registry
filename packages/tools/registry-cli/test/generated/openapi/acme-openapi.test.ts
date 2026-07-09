import { describeGeneratedMcpManifest } from "../generated-test-helpers";

describeGeneratedMcpManifest({
  family: "openapi",
  provider: "acme-openapi",
  manifestPath: "registry/acme-openapi/api.mcp.json",
  manifest: {
    "apiVersion": "quickdeploy.ai/v1",
    "kind": "McpManifest",
    "metadata": {
      "name": "ai.quickdeploy/acme-openapi",
      "version": "0.1.0",
      "title": "Acme Openapi",
      "description": "Generated openapi-2-mcp MCP manifest for Acme Openapi.",
      "labels": [
        "acme-openapi",
        "generated",
        "openapi"
      ]
    },
    "spec": {
      "importer": {
        "engine": "openapi-2-mcp",
        "versionRange": "^0.1.0"
      },
      "source": {
        "type": "http",
        "uri": "https://api.example.test/openapi.json"
      },
      "select": {
        "requests": [
          {
            "method": "GET",
            "uriTemplate": "/widgets/{id}"
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
            "env": "ACME_OPENAPI_TOKEN"
          }
        }
      ],
      "config": {
        "schema": {
          "type": "object",
          "properties": {
            "baseUrl": {
              "type": "string"
            }
          }
        },
        "defaults": {
          "baseUrl": "https://api.example.test"
        },
        "ai.quickdeploy.codegen/source": {
          "uri": "https://api.example.test/openapi.json",
          "type": "http",
          "retrievedAt": "2026-07-09",
          "sourceVersion": "2026-07-01"
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
            "from": "GET /widgets/{id}",
            "name": "get_widgets_id",
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
        "uri": "https://api.example.test/openapi.json",
        "type": "http",
        "retrievedAt": "2026-07-09",
        "sourceVersion": "2026-07-01"
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
        "from": "GET /widgets/{id}",
        "name": "get_widgets_id",
        "deny": false
      }
    ],
    "resources": [],
    "prompts": [],
    "authEnvVars": [
      "ACME_OPENAPI_TOKEN"
    ],
    "serverEnvVars": [
      "ACME_OPENAPI_TOKEN"
    ]
  },
});
