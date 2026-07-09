import { describeGeneratedMcpManifest } from "../generated-test-helpers";

describeGeneratedMcpManifest({
  family: "feed",
  provider: "grants-gov",
  manifestPath: "registry/grants-gov/feed.mcp.json",
  manifest: {
    "apiVersion": "quickdeploy.ai/v1",
    "kind": "McpManifest",
    "metadata": {
      "name": "ai.quickdeploy/grants-gov",
      "version": "0.1.0",
      "title": "Grants.gov",
      "description": "Generated feed-2-mcp MCP manifest for the Grants.gov new/modified opportunities RSS feed.",
      "labels": [
        "feed",
        "generated",
        "government",
        "grants",
        "grants-gov",
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
        "uri": "https://www.grants.gov/rss/GG_OppModByCategory.xml"
      },
      "select": {
        "requests": [],
        "grpcMethods": [],
        "pythonFunctions": [],
        "skills": [],
        "knowledgeSources": [],
        "corpusGlobs": [
          "/opportunities/**"
        ]
      },
      "auth": [],
      "config": {
        "schema": {
          "type": "object",
          "properties": {
            "refreshMinutes": {
              "type": "number"
            },
            "maxItems": {
              "type": "number"
            },
            "includeContent": {
              "type": "boolean"
            }
          }
        },
        "defaults": {
          "refreshMinutes": 60,
          "maxItems": 100,
          "includeContent": true
        },
        "ai.quickdeploy.codegen/source": {
          "uri": "https://www.grants.gov/rss/GG_OppModByCategory.xml",
          "type": "http",
          "retrievedAt": "2026-07-09",
          "sourceVersion": "rss-2.0",
          "notes": [
            "Grants.gov (a U.S. federal government service) publishes official RSS feeds for new and modified funding opportunities, documented at https://grants.gov/connect/rss-feeds (byte-verified sha256:12d7becc41d73f60759b407690c7281bf04d11dd61bb57590b347f5a10a290b7 across two fetches on 2026-07-09). This manifest pins the 'New/Modified Opportunities by Category' feed (GG_OppModByCategory.xml); a sibling feed (GG_OppModByAgency.xml) provides the same updates grouped by federal agency instead of category."
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
            "from": "feed.query",
            "name": "query_grants_gov_feed",
            "deny": false
          }
        ],
        "resources": [
          {
            "from": "feed:item",
            "name": "grants_gov_feed_item",
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
        "uri": "https://www.grants.gov/rss/GG_OppModByCategory.xml",
        "type": "http",
        "retrievedAt": "2026-07-09",
        "sourceVersion": "rss-2.0",
        "notes": [
          "Grants.gov (a U.S. federal government service) publishes official RSS feeds for new and modified funding opportunities, documented at https://grants.gov/connect/rss-feeds (byte-verified sha256:12d7becc41d73f60759b407690c7281bf04d11dd61bb57590b347f5a10a290b7 across two fetches on 2026-07-09). This manifest pins the 'New/Modified Opportunities by Category' feed (GG_OppModByCategory.xml); a sibling feed (GG_OppModByAgency.xml) provides the same updates grouped by federal agency instead of category."
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
        "from": "feed.query",
        "name": "query_grants_gov_feed",
        "deny": false
      }
    ],
    "resources": [
      {
        "from": "feed:item",
        "name": "grants_gov_feed_item",
        "deny": false
      }
    ],
    "prompts": [],
    "authEnvVars": [],
    "serverEnvVars": []
  },
});
