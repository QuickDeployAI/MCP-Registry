import { describeGeneratedMcpManifest } from "../generated-test-helpers";

describeGeneratedMcpManifest({
  family: "feed",
  provider: "google-news-rss",
  manifestPath: "registry/google-news-rss/feed.mcp.json",
  manifest: {
    "apiVersion": "quickdeploy.ai/v1",
    "kind": "McpManifest",
    "metadata": {
      "name": "ai.quickdeploy/google-news-rss",
      "version": "0.1.0",
      "title": "Google News RSS",
      "description": "Generated feed-2-mcp MCP manifest for the Google News top stories RSS feed.",
      "labels": [
        "aggregator",
        "feed",
        "generated",
        "google-news-rss",
        "news",
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
        "uri": "https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en"
      },
      "select": {
        "requests": [],
        "grpcMethods": [],
        "pythonFunctions": [],
        "skills": [],
        "knowledgeSources": [],
        "corpusGlobs": [
          "/news/**"
        ]
      },
      "auth": [],
      "config": {
        "schema": {
          "type": "object",
          "properties": {
            "refreshMinutes": {
              "type": "number",
              "description": "Polling interval in minutes for refreshing the Google News feed."
            },
            "maxItems": {
              "type": "number",
              "description": "Maximum number of retained feed items."
            },
            "includeContent": {
              "type": "boolean",
              "description": "Whether to include full item content in query responses."
            }
          }
        },
        "defaults": {
          "refreshMinutes": 15,
          "maxItems": 200,
          "includeContent": true
        },
        "ai.quickdeploy.codegen/source": {
          "uri": "https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en",
          "type": "http",
          "retrievedAt": "2026-07-09",
          "sourceVersion": "rss-2.0",
          "notes": [
            "Google's Top Stories RSS feed, confirmed via direct fetch: RSS 2.0, channel title \"Top stories - Google News\", channel link https://news.google.com/?hl=en-US&gl=US&ceid=US:en.",
            "Google does not publish formal documentation for these RSS endpoints; the news.google.com/rss URL family (top headlines, topic sections, geo sections, search) is a long-standing, widely-relied-upon convention served directly from Google's own domain rather than a third-party mirror.",
            "Using the plain top-headlines variant (locale hl=en-US, region gl=US, ceid=US:en, no topic/geo/search query) as the broadest and most stable entry point, rather than a narrower topic- or query-scoped feed.",
            "Items expose title, link, guid, pubDate, description (embedded related-coverage HTML), and source attribution.",
            "The feed is public; no authentication is required."
          ]
        },
        "ai.quickdeploy.codegen/policy": {
          "network": [
            "GET https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en for source retrieval and periodic polling"
          ],
          "filesystem": [
            "Read committed manifest registry/google-news-rss/feed.mcp.json",
            "Read committed generated test packages/tools/registry-cli/test/generated/feed/google-news-rss.test.ts",
            "Read/write gitignored generated project .generated/mcp-codegen/feed/google-news-rss/"
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
            "name": "query_google_news_rss_feed",
            "deny": false
          }
        ],
        "resources": [
          {
            "from": "feed:item",
            "name": "google_news_rss_feed_item",
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
        "uri": "https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en",
        "type": "http",
        "retrievedAt": "2026-07-09",
        "sourceVersion": "rss-2.0",
        "notes": [
          "Google's Top Stories RSS feed, confirmed via direct fetch: RSS 2.0, channel title \"Top stories - Google News\", channel link https://news.google.com/?hl=en-US&gl=US&ceid=US:en.",
          "Google does not publish formal documentation for these RSS endpoints; the news.google.com/rss URL family (top headlines, topic sections, geo sections, search) is a long-standing, widely-relied-upon convention served directly from Google's own domain rather than a third-party mirror.",
          "Using the plain top-headlines variant (locale hl=en-US, region gl=US, ceid=US:en, no topic/geo/search query) as the broadest and most stable entry point, rather than a narrower topic- or query-scoped feed.",
          "Items expose title, link, guid, pubDate, description (embedded related-coverage HTML), and source attribution.",
          "The feed is public; no authentication is required."
        ]
      },
      "ai.quickdeploy.codegen/policy": {
        "network": [
          "GET https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en for source retrieval and periodic polling"
        ],
        "filesystem": [
          "Read committed manifest registry/google-news-rss/feed.mcp.json",
          "Read committed generated test packages/tools/registry-cli/test/generated/feed/google-news-rss.test.ts",
          "Read/write gitignored generated project .generated/mcp-codegen/feed/google-news-rss/"
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
        "name": "query_google_news_rss_feed",
        "deny": false
      }
    ],
    "resources": [
      {
        "from": "feed:item",
        "name": "google_news_rss_feed_item",
        "deny": false
      }
    ],
    "prompts": [],
    "authEnvVars": [],
    "serverEnvVars": []
  },
});
