import { describeGeneratedMcpManifest } from "../generated-test-helpers";

describeGeneratedMcpManifest({
  family: "asyncapi",
  provider: "solace-event-portal",
  manifestPath: "registry/solace-event-portal/events.mcp.json",
  manifest: {
    "apiVersion": "quickdeploy.ai/v1",
    "kind": "McpManifest",
    "metadata": {
      "name": "ai.quickdeploy/solace-event-portal",
      "version": "0.1.0",
      "title": "Solace Event Portal",
      "description": "Generated asyncapi-2-mcp MCP manifest for Solace Event Portal event API publish operations.",
      "labels": [
        "asyncapi",
        "event-portal",
        "events",
        "generated",
        "pubsub",
        "solace",
        "solace-event-portal"
      ]
    },
    "spec": {
      "importer": {
        "engine": "asyncapi-2-mcp",
        "versionRange": "^0.1.0"
      },
      "source": {
        "type": "http",
        "uri": "https://www.asyncapi.com/docs/reference/bindings/solace"
      },
      "select": {
        "requests": [
          {
            "method": "PUBLISH",
            "uriTemplate": "channel://event-portal.publish-event"
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
            "env": "SOLACE_EVENT_PORTAL_USERNAME"
          },
          "passwordFrom": {
            "env": "SOLACE_EVENT_PORTAL_PASSWORD"
          }
        }
      ],
      "config": {
        "schema": {
          "type": "object",
          "properties": {
            "brokerProtocol": {
              "type": "string",
              "description": "Delivery protocol for generated publish tools. Solace PubSub+ uses topic/queue destinations per the official Solace AsyncAPI binding, not Kafka/MQTT."
            },
            "publishTimeoutMs": {
              "type": "number",
              "minimum": 1,
              "description": "Per-publish timeout in milliseconds."
            }
          }
        },
        "defaults": {
          "brokerProtocol": "solace",
          "publishTimeoutMs": 30000
        },
        "ai.quickdeploy.codegen/source": {
          "uri": "https://www.asyncapi.com/docs/reference/bindings/solace",
          "type": "http",
          "retrievedAt": "2026-07-09",
          "sourceVersion": "solace binding 0.4.0",
          "notes": [
            "Solace Event Portal is a design-time event catalog; the AsyncAPI documents it exports are per-tenant/per-event-API, so there is no single downloadable official AsyncAPI document for the product itself.",
            "The authoritative, versioned, machine-readable source is the official AsyncAPI Initiative Solace protocol binding specification: https://www.asyncapi.com/docs/reference/bindings/solace (binding version 0.4.0), which defines exactly how Solace queue/topic destinations, delivery mode, and operation bindings are expressed in AsyncAPI — this is what Event Portal's own AsyncAPI exporter emits.",
            "Secondary reference: Solace Event Portal event API export documentation, https://docs.solace.com/Cloud/Event-Portal/event-portal-designer-event-apis.htm.",
            "This manifest models a topic/queue publish operation using the Solace Destination Object shape (destinationType queue|topic, deliveryMode direct|persistent, topic.topicSubscriptions)."
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
            "from": "PUBLISH channel://event-portal.publish-event",
            "name": "publish_channel_event_portal_publish_event",
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
        "uri": "https://www.asyncapi.com/docs/reference/bindings/solace",
        "type": "http",
        "retrievedAt": "2026-07-09",
        "sourceVersion": "solace binding 0.4.0",
        "notes": [
          "Solace Event Portal is a design-time event catalog; the AsyncAPI documents it exports are per-tenant/per-event-API, so there is no single downloadable official AsyncAPI document for the product itself.",
          "The authoritative, versioned, machine-readable source is the official AsyncAPI Initiative Solace protocol binding specification: https://www.asyncapi.com/docs/reference/bindings/solace (binding version 0.4.0), which defines exactly how Solace queue/topic destinations, delivery mode, and operation bindings are expressed in AsyncAPI — this is what Event Portal's own AsyncAPI exporter emits.",
          "Secondary reference: Solace Event Portal event API export documentation, https://docs.solace.com/Cloud/Event-Portal/event-portal-designer-event-apis.htm.",
          "This manifest models a topic/queue publish operation using the Solace Destination Object shape (destinationType queue|topic, deliveryMode direct|persistent, topic.topicSubscriptions)."
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
        "from": "PUBLISH channel://event-portal.publish-event",
        "name": "publish_channel_event_portal_publish_event",
        "deny": false
      }
    ],
    "resources": [],
    "prompts": [],
    "authEnvVars": [
      "SOLACE_EVENT_PORTAL_PASSWORD",
      "SOLACE_EVENT_PORTAL_USERNAME"
    ],
    "serverEnvVars": [
      "SOLACE_EVENT_PORTAL_PASSWORD",
      "SOLACE_EVENT_PORTAL_USERNAME"
    ]
  },
});
