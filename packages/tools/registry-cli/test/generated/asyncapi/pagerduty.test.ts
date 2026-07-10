import { describeGeneratedMcpManifest } from "../generated-test-helpers";

describeGeneratedMcpManifest({
  family: "asyncapi",
  provider: "pagerduty",
  manifestPath: "registry/pagerduty/events.mcp.json",
  manifest: {
    "apiVersion": "quickdeploy.ai/v1",
    "kind": "McpManifest",
    "metadata": {
      "name": "ai.quickdeploy/pagerduty",
      "version": "0.1.0",
      "title": "PagerDuty",
      "description": "Generated PagerDuty Events API v2 incident event MCP catalog manifest.",
      "labels": [
        "asyncapi",
        "events",
        "generated",
        "incident-management",
        "pagerduty",
        "read-only",
        "webhooks"
      ]
    },
    "spec": {
      "importer": {
        "engine": "asyncapi-2-mcp",
        "versionRange": "^0.1.0"
      },
      "source": {
        "type": "http",
        "uri": "https://developer.pagerduty.com/api-reference/f80f5db9acbe3-pager-duty-v2-events-api"
      },
      "select": {
        "requests": [
          {
            "method": "PUBLISH",
            "uriTemplate": "channel://trigger"
          },
          {
            "method": "PUBLISH",
            "uriTemplate": "channel://acknowledge"
          },
          {
            "method": "PUBLISH",
            "uriTemplate": "channel://resolve"
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
          "name": "x-routing-key",
          "valueFrom": {
            "env": "PAGERDUTY_ROUTING_KEY"
          }
        }
      ],
      "config": {
        "schema": {
          "type": "object",
          "properties": {
            "brokerProtocol": {
              "type": "string",
              "description": "AsyncAPI broker binding to use for generated tools, such as kafka or mqtt."
            },
            "publishTimeoutMs": {
              "type": "number",
              "minimum": 1,
              "description": "Per-publish timeout in milliseconds."
            }
          }
        },
        "defaults": {
          "brokerProtocol": "https-events-api",
          "publishTimeoutMs": 30000
        },
        "ai.quickdeploy.codegen/source": {
          "uri": "https://developer.pagerduty.com/api-reference/f80f5db9acbe3-pager-duty-v2-events-api",
          "type": "http",
          "retrievedAt": "2026-07-09",
          "sourceVersion": "pagerduty-events-api-v2",
          "notes": [
            "Official PagerDuty Events API v2 reference: https://developer.pagerduty.com/api-reference/f80f5db9acbe3-pager-duty-v2-events-api",
            "Overview: https://developer.pagerduty.com/docs/events-api-v2-overview",
            "PagerDuty does not publish a formal AsyncAPI document; this manifest models the documented event_action enum (trigger/acknowledge/resolve) as PUBLISH channels.",
            "The Events API v2 endpoint is POST https://events.pagerduty.com/v2/enqueue.",
            "PagerDuty authenticates Events API v2 calls with an integration routing_key carried in the JSON request body rather than an HTTP header; this manifest models it as an api-key-style env ref, with body placement handled by the importer."
          ]
        },
        "ai.quickdeploy.codegen/policy": {
          "network": [
            "GET https://developer.pagerduty.com/api-reference/f80f5db9acbe3-pager-duty-v2-events-api for source retrieval",
            "PUBLISH channel://trigger for selected upstream event",
            "PUBLISH channel://acknowledge for selected upstream event",
            "PUBLISH channel://resolve for selected upstream event"
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
            "from": "PUBLISH channel://trigger",
            "name": "publish_channel_trigger",
            "deny": false
          },
          {
            "from": "PUBLISH channel://acknowledge",
            "name": "publish_channel_acknowledge",
            "deny": false
          },
          {
            "from": "PUBLISH channel://resolve",
            "name": "publish_channel_resolve",
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
        "uri": "https://developer.pagerduty.com/api-reference/f80f5db9acbe3-pager-duty-v2-events-api",
        "type": "http",
        "retrievedAt": "2026-07-09",
        "sourceVersion": "pagerduty-events-api-v2",
        "notes": [
          "Official PagerDuty Events API v2 reference: https://developer.pagerduty.com/api-reference/f80f5db9acbe3-pager-duty-v2-events-api",
          "Overview: https://developer.pagerduty.com/docs/events-api-v2-overview",
          "PagerDuty does not publish a formal AsyncAPI document; this manifest models the documented event_action enum (trigger/acknowledge/resolve) as PUBLISH channels.",
          "The Events API v2 endpoint is POST https://events.pagerduty.com/v2/enqueue.",
          "PagerDuty authenticates Events API v2 calls with an integration routing_key carried in the JSON request body rather than an HTTP header; this manifest models it as an api-key-style env ref, with body placement handled by the importer."
        ]
      },
      "ai.quickdeploy.codegen/policy": {
        "network": [
          "GET https://developer.pagerduty.com/api-reference/f80f5db9acbe3-pager-duty-v2-events-api for source retrieval",
          "PUBLISH channel://trigger for selected upstream event",
          "PUBLISH channel://acknowledge for selected upstream event",
          "PUBLISH channel://resolve for selected upstream event"
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
        "from": "PUBLISH channel://trigger",
        "name": "publish_channel_trigger",
        "deny": false
      },
      {
        "from": "PUBLISH channel://acknowledge",
        "name": "publish_channel_acknowledge",
        "deny": false
      },
      {
        "from": "PUBLISH channel://resolve",
        "name": "publish_channel_resolve",
        "deny": false
      }
    ],
    "resources": [],
    "prompts": [],
    "authEnvVars": [
      "PAGERDUTY_ROUTING_KEY"
    ],
    "serverEnvVars": [
      "PAGERDUTY_ROUTING_KEY"
    ]
  },
});
