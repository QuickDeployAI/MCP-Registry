import { describeGeneratedMcpManifest } from "../generated-test-helpers";

describeGeneratedMcpManifest({
  family: "feed",
  provider: "federal-register",
  manifestPath: "registry/federal-register/feed.mcp.json",
  manifest: {
    "apiVersion": "quickdeploy.ai/v1",
    "kind": "McpManifest",
    "metadata": {
      "name": "ai.quickdeploy/federal-register",
      "version": "0.1.0",
      "title": "Federal Register",
      "description": "Generated Federal Register read-only feed MCP catalog manifest.",
      "labels": [
        "federal-register",
        "feed",
        "generated",
        "government",
        "read-only"
      ]
    },
    "spec": {
      "importer": {
        "engine": "feed-2-mcp",
        "versionRange": "^0.1.0"
      },
      "source": {
        "type": "http",
        "uri": "https://www.govinfo.gov/rss/fr.xml",
        "digest": "sha256:9eb581ac8eb56c5cb9aad75546a713b354133eedba1239cbbd595e807825b22b",
        "ref": "govinfo-federal-register-rss@2026-07-09"
      },
      "select": {
        "requests": [],
        "grpcMethods": [],
        "pythonFunctions": [],
        "skills": [],
        "knowledgeSources": [],
        "corpusGlobs": [
          "/federal-register/**"
        ]
      },
      "auth": [],
      "config": {
        "schema": {
          "type": "object",
          "properties": {
            "refreshMinutes": {
              "type": "number",
              "minimum": 1,
              "description": "Refresh interval for feed polling and cache updates."
            },
            "maxItems": {
              "type": "number",
              "minimum": 1,
              "description": "Maximum feed items retained in the MCP corpus."
            },
            "includeContent": {
              "type": "boolean",
              "description": "Whether full feed content is exposed in resources."
            }
          }
        },
        "defaults": {
          "refreshMinutes": 60,
          "maxItems": 100,
          "includeContent": true
        },
        "ai.quickdeploy.codegen/source": {
          "uri": "https://www.govinfo.gov/rss/fr.xml",
          "type": "http",
          "digest": "sha256:9eb581ac8eb56c5cb9aad75546a713b354133eedba1239cbbd595e807825b22b",
          "ref": "govinfo-federal-register-rss@2026-07-09",
          "retrievedAt": "2026-07-09",
          "sourceVersion": "govinfo-federal-register-rss@2026-07-09",
          "notes": [
            "Official GovInfo Federal Register RSS feed, published by the Office of the Federal Register, National Archives and Records Administration (NARA).",
            "federalregister.gov itself blocks unauthenticated automated fetches of its RSS feed with a bot-detection \"Request Access\" page (confirmed via direct curl), so the officially-published GovInfo mirror is pinned instead.",
            "Canonical source URL: https://www.govinfo.gov/rss/fr.xml",
            "Verified source SHA-256: 9eb581ac8eb56c5cb9aad75546a713b354133eedba1239cbbd595e807825b22b",
            "Provides the 100 most recently published Federal Register documents (rules, proposed rules, notices, and presidential documents)."
          ]
        },
        "ai.quickdeploy.codegen/policy": {
          "network": [
            "GET https://www.govinfo.gov/rss/fr.xml for source retrieval and periodic refresh"
          ],
          "filesystem": [
            "Read committed manifest registry/federal-register/feed.mcp.json",
            "Read committed generated test packages/tools/registry-cli/test/generated/feed/federal-register.test.ts",
            "Read/write gitignored generated project .generated/mcp-codegen/feed/federal-register/"
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
            "from": "feed.query",
            "name": "query_federal_register_feed",
            "deny": false
          }
        ],
        "resources": [
          {
            "from": "feed:item",
            "name": "federal_register_feed_item",
            "deny": false
          }
        ],
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
        "uri": "https://www.govinfo.gov/rss/fr.xml",
        "type": "http",
        "digest": "sha256:9eb581ac8eb56c5cb9aad75546a713b354133eedba1239cbbd595e807825b22b",
        "ref": "govinfo-federal-register-rss@2026-07-09",
        "retrievedAt": "2026-07-09",
        "sourceVersion": "govinfo-federal-register-rss@2026-07-09",
        "notes": [
          "Official GovInfo Federal Register RSS feed, published by the Office of the Federal Register, National Archives and Records Administration (NARA).",
          "federalregister.gov itself blocks unauthenticated automated fetches of its RSS feed with a bot-detection \"Request Access\" page (confirmed via direct curl), so the officially-published GovInfo mirror is pinned instead.",
          "Canonical source URL: https://www.govinfo.gov/rss/fr.xml",
          "Verified source SHA-256: 9eb581ac8eb56c5cb9aad75546a713b354133eedba1239cbbd595e807825b22b",
          "Provides the 100 most recently published Federal Register documents (rules, proposed rules, notices, and presidential documents)."
        ]
      },
      "ai.quickdeploy.codegen/policy": {
        "network": [
          "GET https://www.govinfo.gov/rss/fr.xml for source retrieval and periodic refresh"
        ],
        "filesystem": [
          "Read committed manifest registry/federal-register/feed.mcp.json",
          "Read committed generated test packages/tools/registry-cli/test/generated/feed/federal-register.test.ts",
          "Read/write gitignored generated project .generated/mcp-codegen/feed/federal-register/"
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
        "from": "feed.query",
        "name": "query_federal_register_feed",
        "deny": false
      }
    ],
    "resources": [
      {
        "from": "feed:item",
        "name": "federal_register_feed_item",
        "deny": false
      }
    ],
    "prompts": [],
    "authEnvVars": [],
    "serverEnvVars": []
  },
});
