import { describeGeneratedMcpManifest } from "../generated-test-helpers";

describeGeneratedMcpManifest({
  family: "asyncapi",
  provider: "cloudevents",
  manifestPath: "registry/cloudevents/events.mcp.json",
  manifest: {
    "apiVersion": "quickdeploy.ai/v1",
    "kind": "McpManifest",
    "metadata": {
      "name": "ai.quickdeploy/cloudevents",
      "version": "0.1.0",
      "title": "CloudEvents",
      "description": "Generated asyncapi-2-mcp MCP manifest for publishing CloudEvents-formatted events.",
      "labels": [
        "asyncapi",
        "cloudevents",
        "cncf",
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
        "uri": "https://raw.githubusercontent.com/cloudevents/spec/v1.0.2/cloudevents/formats/cloudevents.json",
        "digest": "sha256:e28a6d252d7b7238d176618f6bbf6cde570b26a867bc5241563aed34c9dd1d83",
        "ref": "v1.0.2"
      },
      "select": {
        "requests": [
          {
            "method": "PUBLISH",
            "uriTemplate": "channel://cloudevents.publish-event"
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
            "env": "CLOUDEVENTS_SINK_ACCESS_TOKEN"
          }
        }
      ],
      "config": {
        "schema": {
          "type": "object",
          "properties": {
            "brokerProtocol": {
              "type": "string",
              "description": "Delivery protocol for generated publish tools. Defaults to the CloudEvents HTTP Protocol Binding."
            },
            "publishTimeoutMs": {
              "type": "number",
              "minimum": 1,
              "description": "Per-publish timeout in milliseconds."
            }
          }
        },
        "defaults": {
          "brokerProtocol": "http",
          "publishTimeoutMs": 30000
        },
        "ai.quickdeploy.codegen/source": {
          "uri": "https://raw.githubusercontent.com/cloudevents/spec/v1.0.2/cloudevents/formats/cloudevents.json",
          "type": "http",
          "digest": "sha256:e28a6d252d7b7238d176618f6bbf6cde570b26a867bc5241563aed34c9dd1d83",
          "ref": "v1.0.2",
          "retrievedAt": "2026-07-09",
          "sourceVersion": "cloudevents/spec@v1.0.2:cloudevents/formats/cloudevents.json",
          "notes": [
            "Official CloudEvents Specification repository: https://github.com/cloudevents/spec",
            "Pinned release tag: v1.0.2 (released 2024-02-06), the latest stable CloudEvents core specification.",
            "Pinned machine-readable JSON Schema path: cloudevents/formats/cloudevents.json",
            "Verified source SHA-256: e28a6d252d7b7238d176618f6bbf6cde570b26a867bc5241563aed34c9dd1d83",
            "CloudEvents is a transport- and auth-agnostic event envelope format (id, source, specversion, type, data, datacontenttype, dataschema, subject, time). It does not mandate a broker or credential scheme.",
            "This manifest assumes the most common interoperable transport — an HTTP sink endpoint (CloudEvents HTTP Protocol Binding) — and models bearer-token auth for that sink accordingly; brokerProtocol defaults to \"http\" rather than Kafka/MQTT."
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
            "from": "PUBLISH channel://cloudevents.publish-event",
            "name": "publish_channel_cloudevents_publish_event",
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
        "uri": "https://raw.githubusercontent.com/cloudevents/spec/v1.0.2/cloudevents/formats/cloudevents.json",
        "type": "http",
        "digest": "sha256:e28a6d252d7b7238d176618f6bbf6cde570b26a867bc5241563aed34c9dd1d83",
        "ref": "v1.0.2",
        "retrievedAt": "2026-07-09",
        "sourceVersion": "cloudevents/spec@v1.0.2:cloudevents/formats/cloudevents.json",
        "notes": [
          "Official CloudEvents Specification repository: https://github.com/cloudevents/spec",
          "Pinned release tag: v1.0.2 (released 2024-02-06), the latest stable CloudEvents core specification.",
          "Pinned machine-readable JSON Schema path: cloudevents/formats/cloudevents.json",
          "Verified source SHA-256: e28a6d252d7b7238d176618f6bbf6cde570b26a867bc5241563aed34c9dd1d83",
          "CloudEvents is a transport- and auth-agnostic event envelope format (id, source, specversion, type, data, datacontenttype, dataschema, subject, time). It does not mandate a broker or credential scheme.",
          "This manifest assumes the most common interoperable transport — an HTTP sink endpoint (CloudEvents HTTP Protocol Binding) — and models bearer-token auth for that sink accordingly; brokerProtocol defaults to \"http\" rather than Kafka/MQTT."
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
        "from": "PUBLISH channel://cloudevents.publish-event",
        "name": "publish_channel_cloudevents_publish_event",
        "deny": false
      }
    ],
    "resources": [],
    "prompts": [],
    "authEnvVars": [
      "CLOUDEVENTS_SINK_ACCESS_TOKEN"
    ],
    "serverEnvVars": [
      "CLOUDEVENTS_SINK_ACCESS_TOKEN"
    ]
  },
});
