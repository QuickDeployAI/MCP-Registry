import { describeGeneratedMcpManifest } from "../generated-test-helpers";

describeGeneratedMcpManifest({
  family: "feed",
  provider: "status-indicators",
  manifestPath: "registry/status-indicators/feed.mcp.json",
  manifest: {
    "apiVersion": "quickdeploy.ai/v1",
    "kind": "McpManifest",
    "metadata": {
      "name": "ai.quickdeploy/status-indicators",
      "version": "0.1.0",
      "title": "Status Indicators",
      "description": "Generated high-value infrastructure status incident RSS feed aggregator MCP catalog manifest.",
      "labels": [
        "aggregator",
        "feed",
        "generated",
        "infrastructure",
        "status",
        "rss"
      ]
    },
    "spec": {
      "importer": {
        "engine": "feed-2-mcp",
        "versionRange": "^0.1.0"
      },
      "source": {
        "type": "http",
        "uri": "https://www.githubstatus.com/history.rss",
        "ref": "status-indicators-aggregator@2026-07-09"
      },
      "select": {
        "requests": [],
        "grpcMethods": [],
        "pythonFunctions": [],
        "skills": [],
        "knowledgeSources": [],
        "corpusGlobs": [
          "/status/**"
        ]
      },
      "auth": [],
      "config": {
        "schema": {
          "type": "object",
          "properties": {
            "refreshMinutes": {
              "type": "number",
              "description": "Refresh interval for feed polling and cache updates."
            },
            "maxItems": {
              "type": "number",
              "description": "Maximum feed items retained in the MCP corpus."
            },
            "includeContent": {
              "type": "boolean",
              "description": "Whether full incident update descriptions are exposed in resources."
            }
          }
        },
        "defaults": {
          "refreshMinutes": 5,
          "maxItems": 100,
          "includeContent": true
        },
        "ai.quickdeploy.codegen/source": {
          "uri": "https://www.githubstatus.com/history.rss",
          "type": "http",
          "ref": "status-indicators-aggregator@2026-07-09",
          "retrievedAt": "2026-07-09",
          "sourceVersion": "status-indicators-aggregator",
          "notes": [
            "This is a multi-source status aggregator; McpManifestSourceSchema only supports a single canonical spec.source URI per manifest, so the primary representative source is GitHub's official Statuspage-powered incident history RSS feed: https://www.githubstatus.com/history.rss.",
            "Verified by direct fetch: real, live RSS 2.0 XML with per-incident <item> entries (title, description, pubDate).",
            "A second high-value infrastructure source, Cloudflare's equivalent official status feed (https://www.cloudflarestatus.com/history.rss), was also verified by direct fetch and is explicitly allowlisted in the network policy below; both follow the same statuspage.io '/history.rss' convention used by hundreds of infrastructure providers, so additional sources can be added to the allowlist using the same pattern.",
            "No content digest is pinned: per the feed-2-mcp family convention (see the committed acme-feed fixture and the merged github-releases/pypi-releases/npm-releases manifests), feed sources are live/mutable data streams, not static spec documents, so only the stable URL pattern and retrieval date are recorded."
          ]
        },
        "ai.quickdeploy.codegen/policy": {
          "network": [
            "GET https://www.githubstatus.com/history.rss for feed retrieval (primary source)",
            "GET https://www.cloudflarestatus.com/history.rss for feed retrieval (additional allowlisted source)"
          ],
          "filesystem": [
            "Read committed manifest registry/status-indicators/feed.mcp.json",
            "Read committed generated test packages/tools/registry-cli/test/generated/feed/status-indicators.test.ts",
            "Read/write gitignored generated project .generated/mcp-codegen/feed/status-indicators/"
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
            "name": "query_status_indicators_feed",
            "deny": false
          }
        ],
        "resources": [
          {
            "from": "feed:item",
            "name": "status_indicators_feed_item",
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
        "uri": "https://www.githubstatus.com/history.rss",
        "type": "http",
        "ref": "status-indicators-aggregator@2026-07-09",
        "retrievedAt": "2026-07-09",
        "sourceVersion": "status-indicators-aggregator",
        "notes": [
          "This is a multi-source status aggregator; McpManifestSourceSchema only supports a single canonical spec.source URI per manifest, so the primary representative source is GitHub's official Statuspage-powered incident history RSS feed: https://www.githubstatus.com/history.rss.",
          "Verified by direct fetch: real, live RSS 2.0 XML with per-incident <item> entries (title, description, pubDate).",
          "A second high-value infrastructure source, Cloudflare's equivalent official status feed (https://www.cloudflarestatus.com/history.rss), was also verified by direct fetch and is explicitly allowlisted in the network policy below; both follow the same statuspage.io '/history.rss' convention used by hundreds of infrastructure providers, so additional sources can be added to the allowlist using the same pattern.",
          "No content digest is pinned: per the feed-2-mcp family convention (see the committed acme-feed fixture and the merged github-releases/pypi-releases/npm-releases manifests), feed sources are live/mutable data streams, not static spec documents, so only the stable URL pattern and retrieval date are recorded."
        ]
      },
      "ai.quickdeploy.codegen/policy": {
        "network": [
          "GET https://www.githubstatus.com/history.rss for feed retrieval (primary source)",
          "GET https://www.cloudflarestatus.com/history.rss for feed retrieval (additional allowlisted source)"
        ],
        "filesystem": [
          "Read committed manifest registry/status-indicators/feed.mcp.json",
          "Read committed generated test packages/tools/registry-cli/test/generated/feed/status-indicators.test.ts",
          "Read/write gitignored generated project .generated/mcp-codegen/feed/status-indicators/"
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
        "name": "query_status_indicators_feed",
        "deny": false
      }
    ],
    "resources": [
      {
        "from": "feed:item",
        "name": "status_indicators_feed_item",
        "deny": false
      }
    ],
    "prompts": [],
    "authEnvVars": [],
    "serverEnvVars": []
  },
});
