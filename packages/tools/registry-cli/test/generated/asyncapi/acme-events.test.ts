import { describeGeneratedMcpManifest } from "../generated-test-helpers";

describeGeneratedMcpManifest({
  family: "asyncapi",
  provider: "acme-events",
  manifestPath: "registry/acme-events/events.mcp.json",
  manifest: {
    "apiVersion": "quickdeploy.ai/v1",
    "kind": "McpManifest",
    "metadata": {
      "name": "ai.quickdeploy/acme-events",
      "version": "0.1.0",
      "title": "Acme Events",
      "description": "Generated asyncapi-2-mcp MCP manifest for Acme Events.",
      "labels": [
        "acme-events",
        "asyncapi",
        "generated"
      ]
    },
    "spec": {
      "importer": {
        "engine": "asyncapi-2-mcp",
        "versionRange": "^0.1.0"
      },
      "source": {
        "type": "http",
        "uri": "https://events.example.test/asyncapi.json"
      },
      "select": {
        "requests": [
          {
            "method": "PUBLISH",
            "uriTemplate": "channel://orders.created"
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
          "type": "api-key",
          "in": "header",
          "name": "x-api-key",
          "valueFrom": {
            "env": "ACME_EVENTS_API_KEY"
          }
        }
      ],
      "config": {
        "schema": {
          "type": "object",
          "properties": {
            "brokerProtocol": {
              "type": "string"
            }
          }
        },
        "defaults": {
          "brokerProtocol": "kafka"
        },
        "ai.quickdeploy.codegen/source": {
          "uri": "https://events.example.test/asyncapi.json",
          "type": "http",
          "retrievedAt": "2026-07-09",
          "sourceVersion": "1.2.0"
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
            "from": "PUBLISH channel://orders.created",
            "name": "publish_channel_orders_created",
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
        "uri": "https://events.example.test/asyncapi.json",
        "type": "http",
        "retrievedAt": "2026-07-09",
        "sourceVersion": "1.2.0"
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
        "from": "PUBLISH channel://orders.created",
        "name": "publish_channel_orders_created",
        "deny": false
      }
    ],
    "resources": [],
    "prompts": [],
    "authEnvVars": [
      "ACME_EVENTS_API_KEY"
    ],
    "serverEnvVars": [
      "ACME_EVENTS_API_KEY"
    ]
  },
});
