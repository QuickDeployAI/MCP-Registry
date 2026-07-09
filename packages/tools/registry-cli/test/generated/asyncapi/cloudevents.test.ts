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
      "description": "Generated CloudEvents v1.0 publish AsyncAPI MCP catalog manifest.",
      "labels": [
        "generated",
        "asyncapi",
        "events",
        "cloudevents",
        "cncf"
      ]
    },
    "spec": {
      "importer": {
        "engine": "asyncapi-2-mcp",
        "versionRange": "^0.1.0"
      },
      "source": {
        "type": "http",
        "uri": "https://raw.githubusercontent.com/cloudevents/spec/ce@v1.0.2/cloudevents/formats/cloudevents.json",
        "digest": "sha256:e28a6d252d7b7238d176618f6bbf6cde570b26a867bc5241563aed34c9dd1d83",
        "ref": "ce@v1.0.2"
      },
      "select": {
        "requests": [
          {
            "method": "PUBLISH",
            "uriTemplate": "channel://cloudevents.v1.event"
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
            "env": "CLOUDEVENTS_ACCESS_TOKEN"
          }
        }
      ],
      "config": {
        "schema": {
          "type": "object",
          "properties": {
            "brokerProtocol": {
              "type": "string",
              "description": "Wire protocol used to publish events."
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
          "uri": "https://raw.githubusercontent.com/cloudevents/spec/ce@v1.0.2/cloudevents/formats/cloudevents.json",
          "type": "http",
          "digest": "sha256:e28a6d252d7b7238d176618f6bbf6cde570b26a867bc5241563aed34c9dd1d83",
          "ref": "ce@v1.0.2",
          "retrievedAt": "2026-07-09",
          "sourceVersion": "ce@v1.0.2",
          "notes": [
            "Official CNCF CloudEvents specification repository (cloudevents/spec): https://github.com/cloudevents/spec",
            "Pinned to the core CloudEvents JSON Schema at the latest stable release tag ce@v1.0.2 (2025-02-06): https://raw.githubusercontent.com/cloudevents/spec/ce@v1.0.2/cloudevents/formats/cloudevents.json",
            "CloudEvents is a wire-format specification (not a single vendor API or broker); this manifest represents publishing a CloudEvents v1.0-formatted event over the CloudEvents HTTP protocol binding to a configurable receiver endpoint.",
            "CloudEvents itself is transport/auth-agnostic; auth is modeled as a generic bearer token against the receiver endpoint (env ref only, no literal secrets).",
            "Verified source SHA-256: e28a6d252d7b7238d176618f6bbf6cde570b26a867bc5241563aed34c9dd1d83",
            "The committed manifest selects a single publish operation representing sending a CloudEvents v1.0 event."
          ]
        },
        "ai.quickdeploy.codegen/policy": {
          "network": [
            "GET https://raw.githubusercontent.com/cloudevents/spec/ce@v1.0.2/cloudevents/formats/cloudevents.json for source retrieval",
            "POST https://<cloudevents-receiver-endpoint> for selected publish operation"
          ],
          "filesystem": [
            "Read committed manifest registry/cloudevents/events.mcp.json",
            "Read committed generated test packages/tools/registry-cli/test/generated/asyncapi/cloudevents.test.ts",
            "Read/write gitignored generated project .generated/mcp-codegen/asyncapi/cloudevents/"
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
            "from": "PUBLISH channel://cloudevents.v1.event",
            "name": "publish_cloudevents_v1_event",
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
        "uri": "https://raw.githubusercontent.com/cloudevents/spec/ce@v1.0.2/cloudevents/formats/cloudevents.json",
        "type": "http",
        "digest": "sha256:e28a6d252d7b7238d176618f6bbf6cde570b26a867bc5241563aed34c9dd1d83",
        "ref": "ce@v1.0.2",
        "retrievedAt": "2026-07-09",
        "sourceVersion": "ce@v1.0.2",
        "notes": [
          "Official CNCF CloudEvents specification repository (cloudevents/spec): https://github.com/cloudevents/spec",
          "Pinned to the core CloudEvents JSON Schema at the latest stable release tag ce@v1.0.2 (2025-02-06): https://raw.githubusercontent.com/cloudevents/spec/ce@v1.0.2/cloudevents/formats/cloudevents.json",
          "CloudEvents is a wire-format specification (not a single vendor API or broker); this manifest represents publishing a CloudEvents v1.0-formatted event over the CloudEvents HTTP protocol binding to a configurable receiver endpoint.",
          "CloudEvents itself is transport/auth-agnostic; auth is modeled as a generic bearer token against the receiver endpoint (env ref only, no literal secrets).",
          "Verified source SHA-256: e28a6d252d7b7238d176618f6bbf6cde570b26a867bc5241563aed34c9dd1d83",
          "The committed manifest selects a single publish operation representing sending a CloudEvents v1.0 event."
        ]
      },
      "ai.quickdeploy.codegen/policy": {
        "network": [
          "GET https://raw.githubusercontent.com/cloudevents/spec/ce@v1.0.2/cloudevents/formats/cloudevents.json for source retrieval",
          "POST https://<cloudevents-receiver-endpoint> for selected publish operation"
        ],
        "filesystem": [
          "Read committed manifest registry/cloudevents/events.mcp.json",
          "Read committed generated test packages/tools/registry-cli/test/generated/asyncapi/cloudevents.test.ts",
          "Read/write gitignored generated project .generated/mcp-codegen/asyncapi/cloudevents/"
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
        "from": "PUBLISH channel://cloudevents.v1.event",
        "name": "publish_cloudevents_v1_event",
        "deny": false
      }
    ],
    "resources": [],
    "prompts": [],
    "authEnvVars": [
      "CLOUDEVENTS_ACCESS_TOKEN"
    ],
    "serverEnvVars": [
      "CLOUDEVENTS_ACCESS_TOKEN"
    ]
  },
});
