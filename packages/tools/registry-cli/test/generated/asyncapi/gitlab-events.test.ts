import { describeGeneratedMcpManifest } from "../generated-test-helpers";

describeGeneratedMcpManifest({
  family: "asyncapi",
  provider: "gitlab-events",
  manifestPath: "registry/gitlab-events/events.mcp.json",
  manifest: {
    "apiVersion": "quickdeploy.ai/v1",
    "kind": "McpManifest",
    "metadata": {
      "name": "ai.quickdeploy/gitlab-events",
      "version": "0.1.0",
      "title": "GitLab Events",
      "description": "Generated GitLab webhook events read-only AsyncAPI MCP catalog manifest.",
      "labels": [
        "asyncapi",
        "generated",
        "gitlab-events",
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
        "uri": "https://docs.gitlab.com/user/project/integrations/webhook_events/",
        "digest": "sha256:24878758c9aa6de8ffe1acf2256941bd2adf0514fc89d844ad2101c6edf56c1c",
        "ref": "gitlab-webhook-events-docs@2026-07-09"
      },
      "select": {
        "requests": [
          {
            "method": "SUBSCRIBE",
            "uriTemplate": "channel://push"
          },
          {
            "method": "SUBSCRIBE",
            "uriTemplate": "channel://merge_request"
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
          "name": "X-Gitlab-Token",
          "valueFrom": {
            "env": "GITLAB_WEBHOOK_SECRET"
          }
        }
      ],
      "config": {
        "schema": {
          "type": "object",
          "properties": {
            "brokerProtocol": {
              "type": "string",
              "description": "Transport binding for generated subscribe tools."
            },
            "publishTimeoutMs": {
              "type": "number",
              "minimum": 1,
              "description": "Per-call timeout in milliseconds."
            }
          }
        },
        "defaults": {
          "brokerProtocol": "webhook",
          "publishTimeoutMs": 30000
        },
        "ai.quickdeploy.codegen/source": {
          "uri": "https://docs.gitlab.com/user/project/integrations/webhook_events/",
          "type": "http",
          "digest": "sha256:24878758c9aa6de8ffe1acf2256941bd2adf0514fc89d844ad2101c6edf56c1c",
          "ref": "gitlab-webhook-events-docs@2026-07-09",
          "retrievedAt": "2026-07-09",
          "sourceVersion": "gitlab-webhook-events-docs@2026-07-09",
          "notes": [
            "Official GitLab \"Webhook events\" documentation page.",
            "GitLab does not publish an AsyncAPI document for webhook events. This manifest pins the official documentation source used for the catalog entry, matching the Salesforce/Airtable/Eventarc precedent (QUI-351, QUI-366, QUI-372) for providers without a first-party AsyncAPI/OpenAPI artifact.",
            "Canonical source URL: https://docs.gitlab.com/user/project/integrations/webhook_events/",
            "Verified source SHA-256: 24878758c9aa6de8ffe1acf2256941bd2adf0514fc89d844ad2101c6edf56c1c",
            "The committed manifest selects a read-only representative subset of documented webhook object_kind values: push and merge_request events."
          ]
        },
        "ai.quickdeploy.codegen/policy": {
          "network": [
            "GET https://docs.gitlab.com/user/project/integrations/webhook_events/ for source retrieval",
            "SUBSCRIBE channel://push for selected upstream operation",
            "SUBSCRIBE channel://merge_request for selected upstream operation"
          ],
          "filesystem": [
            "Read committed manifest registry/gitlab-events/events.mcp.json",
            "Read committed generated test packages/tools/registry-cli/test/generated/asyncapi/gitlab-events.test.ts",
            "Read/write gitignored generated project .generated/mcp-codegen/asyncapi/gitlab-events/"
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
            "from": "SUBSCRIBE channel://push",
            "name": "subscribe_gitlab_push_events",
            "deny": false
          },
          {
            "from": "SUBSCRIBE channel://merge_request",
            "name": "subscribe_gitlab_merge_request_events",
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
        "uri": "https://docs.gitlab.com/user/project/integrations/webhook_events/",
        "type": "http",
        "digest": "sha256:24878758c9aa6de8ffe1acf2256941bd2adf0514fc89d844ad2101c6edf56c1c",
        "ref": "gitlab-webhook-events-docs@2026-07-09",
        "retrievedAt": "2026-07-09",
        "sourceVersion": "gitlab-webhook-events-docs@2026-07-09",
        "notes": [
          "Official GitLab \"Webhook events\" documentation page.",
          "GitLab does not publish an AsyncAPI document for webhook events. This manifest pins the official documentation source used for the catalog entry, matching the Salesforce/Airtable/Eventarc precedent (QUI-351, QUI-366, QUI-372) for providers without a first-party AsyncAPI/OpenAPI artifact.",
          "Canonical source URL: https://docs.gitlab.com/user/project/integrations/webhook_events/",
          "Verified source SHA-256: 24878758c9aa6de8ffe1acf2256941bd2adf0514fc89d844ad2101c6edf56c1c",
          "The committed manifest selects a read-only representative subset of documented webhook object_kind values: push and merge_request events."
        ]
      },
      "ai.quickdeploy.codegen/policy": {
        "network": [
          "GET https://docs.gitlab.com/user/project/integrations/webhook_events/ for source retrieval",
          "SUBSCRIBE channel://push for selected upstream operation",
          "SUBSCRIBE channel://merge_request for selected upstream operation"
        ],
        "filesystem": [
          "Read committed manifest registry/gitlab-events/events.mcp.json",
          "Read committed generated test packages/tools/registry-cli/test/generated/asyncapi/gitlab-events.test.ts",
          "Read/write gitignored generated project .generated/mcp-codegen/asyncapi/gitlab-events/"
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
        "from": "SUBSCRIBE channel://push",
        "name": "subscribe_gitlab_push_events",
        "deny": false
      },
      {
        "from": "SUBSCRIBE channel://merge_request",
        "name": "subscribe_gitlab_merge_request_events",
        "deny": false
      }
    ],
    "resources": [],
    "prompts": [],
    "authEnvVars": [
      "GITLAB_WEBHOOK_SECRET"
    ],
    "serverEnvVars": [
      "GITLAB_WEBHOOK_SECRET"
    ]
  },
});
