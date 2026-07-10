import { describeGeneratedMcpManifest } from "../generated-test-helpers";

describeGeneratedMcpManifest({
  family: "feed",
  provider: "hacker-news",
  manifestPath: "registry/hacker-news/feed.mcp.json",
  manifest: {
    "apiVersion": "quickdeploy.ai/v1",
    "kind": "McpManifest",
    "metadata": {
      "name": "ai.quickdeploy/hacker-news",
      "version": "0.1.0",
      "title": "Hacker News",
      "description": "Generated feed-2-mcp MCP manifest for the official Hacker News front-page RSS feed.",
      "labels": [
        "feed",
        "generated",
        "hacker-news",
        "news",
        "tech"
      ]
    },
    "spec": {
      "importer": {
        "engine": "feed-2-mcp",
        "versionRange": "^0.1.0"
      },
      "source": {
        "type": "http",
        "uri": "https://news.ycombinator.com/rss"
      },
      "select": {
        "requests": [],
        "grpcMethods": [],
        "pythonFunctions": [],
        "skills": [],
        "knowledgeSources": [],
        "corpusGlobs": [
          "/stories/**"
        ]
      },
      "auth": [],
      "config": {
        "defaults": {
          "refreshMinutes": 15,
          "maxItems": 30,
          "includeContent": false
        },
        "ai.quickdeploy.codegen/source": {
          "uri": "https://news.ycombinator.com/rss",
          "type": "http",
          "retrievedAt": "2026-07-09",
          "sourceVersion": "rss-2.0",
          "notes": [
            "Official Hacker News RSS feed, linked from the site footer at https://news.ycombinator.com/ (\"rss\" link) and documented in the Hacker News FAQ (https://news.ycombinator.com/newsfaq.html).",
            "Verified live and fetchable at retrieval time; feed content is the current front-page story list and updates continuously (no fixed version)."
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
            "name": "query_hacker_news_feed",
            "deny": false
          }
        ],
        "resources": [
          {
            "from": "feed:item",
            "name": "hacker_news_feed_item",
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
        "uri": "https://news.ycombinator.com/rss",
        "type": "http",
        "retrievedAt": "2026-07-09",
        "sourceVersion": "rss-2.0",
        "notes": [
          "Official Hacker News RSS feed, linked from the site footer at https://news.ycombinator.com/ (\"rss\" link) and documented in the Hacker News FAQ (https://news.ycombinator.com/newsfaq.html).",
          "Verified live and fetchable at retrieval time; feed content is the current front-page story list and updates continuously (no fixed version)."
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
        "name": "query_hacker_news_feed",
        "deny": false
      }
    ],
    "resources": [
      {
        "from": "feed:item",
        "name": "hacker_news_feed_item",
        "deny": false
      }
    ],
    "prompts": [],
    "authEnvVars": [],
    "serverEnvVars": []
  },
});
