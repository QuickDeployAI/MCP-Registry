import { describeGeneratedMcpManifest } from "../generated-test-helpers";

describeGeneratedMcpManifest({
  family: "asyncapi",
  provider: "amazon-eventbridge",
  manifestPath: "registry/amazon-eventbridge/events.mcp.json",
  manifest: {
    "apiVersion": "quickdeploy.ai/v1",
    "kind": "McpManifest",
    "metadata": {
      "name": "ai.quickdeploy/amazon-eventbridge",
      "version": "0.1.0",
      "title": "Amazon EventBridge",
      "description": "Generated asyncapi-2-mcp MCP manifest for Amazon EventBridge PutEvents.",
      "labels": [
        "amazon-eventbridge",
        "asyncapi",
        "aws",
        "eventbridge",
        "events",
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
        "uri": "https://docs.aws.amazon.com/eventbridge/latest/APIReference/API_PutEvents.html"
      },
      "select": {
        "requests": [
          {
            "method": "PUBLISH",
            "uriTemplate": "channel://eventbridge.put-events"
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
            "env": "AMAZON_EVENTBRIDGE_ACCESS_KEY_ID"
          },
          "passwordFrom": {
            "env": "AMAZON_EVENTBRIDGE_SECRET_ACCESS_KEY"
          }
        }
      ],
      "config": {
        "schema": {
          "type": "object",
          "properties": {
            "brokerProtocol": {
              "type": "string",
              "description": "Delivery protocol for generated publish tools. EventBridge PutEvents uses SigV4-signed HTTPS, not Kafka/MQTT."
            },
            "publishTimeoutMs": {
              "type": "number",
              "minimum": 1,
              "description": "Per-publish timeout in milliseconds."
            }
          }
        },
        "defaults": {
          "brokerProtocol": "https",
          "publishTimeoutMs": 30000
        },
        "ai.quickdeploy.codegen/source": {
          "uri": "https://docs.aws.amazon.com/eventbridge/latest/APIReference/API_PutEvents.html",
          "type": "http",
          "retrievedAt": "2026-07-09",
          "sourceVersion": "2015-10-07",
          "notes": [
            "Official AWS EventBridge API Reference: https://docs.aws.amazon.com/eventbridge/latest/APIReference/Welcome.html",
            "Pinned operation reference: https://docs.aws.amazon.com/eventbridge/latest/APIReference/API_PutEvents.html",
            "Pinned request entry reference: https://docs.aws.amazon.com/eventbridge/latest/APIReference/API_PutEventsRequestEntry.html",
            "EventBridge API version 2015-10-07 (from the official AWS API Reference PDF title).",
            "AWS does not publish a first-party AsyncAPI document for EventBridge; this manifest models the PutEvents publish operation (Source, DetailType, Detail, Resources, EventBusName, Time, TraceHeader) directly from the official API Reference above.",
            "PutEvents requires AWS SigV4-signed HTTPS requests (Content-Type application/x-amz-json-1.1, X-Amz-Target: AWSEvents.PutEvents) rather than a Kafka/MQTT broker binding."
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
            "from": "PUBLISH channel://eventbridge.put-events",
            "name": "publish_channel_eventbridge_put_events",
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
        "uri": "https://docs.aws.amazon.com/eventbridge/latest/APIReference/API_PutEvents.html",
        "type": "http",
        "retrievedAt": "2026-07-09",
        "sourceVersion": "2015-10-07",
        "notes": [
          "Official AWS EventBridge API Reference: https://docs.aws.amazon.com/eventbridge/latest/APIReference/Welcome.html",
          "Pinned operation reference: https://docs.aws.amazon.com/eventbridge/latest/APIReference/API_PutEvents.html",
          "Pinned request entry reference: https://docs.aws.amazon.com/eventbridge/latest/APIReference/API_PutEventsRequestEntry.html",
          "EventBridge API version 2015-10-07 (from the official AWS API Reference PDF title).",
          "AWS does not publish a first-party AsyncAPI document for EventBridge; this manifest models the PutEvents publish operation (Source, DetailType, Detail, Resources, EventBusName, Time, TraceHeader) directly from the official API Reference above.",
          "PutEvents requires AWS SigV4-signed HTTPS requests (Content-Type application/x-amz-json-1.1, X-Amz-Target: AWSEvents.PutEvents) rather than a Kafka/MQTT broker binding."
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
        "from": "PUBLISH channel://eventbridge.put-events",
        "name": "publish_channel_eventbridge_put_events",
        "deny": false
      }
    ],
    "resources": [],
    "prompts": [],
    "authEnvVars": [
      "AMAZON_EVENTBRIDGE_ACCESS_KEY_ID",
      "AMAZON_EVENTBRIDGE_SECRET_ACCESS_KEY"
    ],
    "serverEnvVars": [
      "AMAZON_EVENTBRIDGE_ACCESS_KEY_ID",
      "AMAZON_EVENTBRIDGE_SECRET_ACCESS_KEY"
    ]
  },
});
