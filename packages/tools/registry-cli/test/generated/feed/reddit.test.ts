import { describeGeneratedMcpManifest } from "../generated-test-helpers";

describeGeneratedMcpManifest({
  family: "feed",
  provider: "reddit",
  manifestPath: "registry/reddit/feed.mcp.json",
  manifest: {
    "apiVersion": "quickdeploy.ai/v1",
    "kind": "McpManifest",
    "metadata": {
      "name": "ai.quickdeploy/reddit",
      "version": "0.1.0",
      "title": "Reddit",
      "description": "Generated Reddit subreddit Atom feed MCP catalog manifest.",
      "labels": [
        "feed",
        "forum",
        "generated",
        "news",
        "read-only",
        "reddit",
        "rss",
        "social"
      ]
    },
    "spec": {
      "importer": {
        "engine": "feed-2-mcp",
        "versionRange": "^0.1.0"
      },
      "source": {
        "type": "http",
        "uri": "https://www.reddit.com/r/programming/.rss"
      },
      "select": {
        "requests": [],
        "grpcMethods": [],
        "pythonFunctions": [],
        "skills": [],
        "knowledgeSources": [],
        "corpusGlobs": [
          "/posts/**"
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
              "description": "Background polling interval in minutes for refreshing the feed."
            },
            "maxItems": {
              "type": "number",
              "minimum": 1,
              "description": "Maximum number of feed items retained per subreddit."
            },
            "includeContent": {
              "type": "boolean",
              "description": "Whether to include full post HTML content in query responses."
            }
          }
        },
        "defaults": {
          "refreshMinutes": 15,
          "maxItems": 50,
          "includeContent": true
        },
        "ai.quickdeploy.codegen/source": {
          "uri": "https://www.reddit.com/r/programming/.rss",
          "type": "http",
          "retrievedAt": "2026-07-09",
          "sourceVersion": "reddit-subreddit-atom-feed",
          "notes": [
            "Reddit publishes a public per-subreddit Atom feed by appending .rss to any subreddit listing URL, e.g. https://www.reddit.com/r/<subreddit>/.rss (also supported per-user, per-multireddit, and per-sort such as /new/.rss or /top/.rss); this is a long-standing, stable Reddit platform feature rather than a page in Reddit's formal Data API developer docs.",
            "Reddit's edge/WAF returns HTTP 403 to automated/unauthenticated fetches of this feed (confirmed via direct curl from this environment: `HTTP/2 403`, content-type text/html anti-bot challenge page), so no fetched-page content digest is pinned here; matches the eBay Trading (QUI-391) and HubSpot (QUI-352) precedent for sources that block unauthenticated automated retrieval.",
            "The feed is standard Atom XML (xmlns=\"http://www.w3.org/2005/Atom\") with one <entry> per post: title, link, author, id, published/updated timestamps, content (HTML snippet), and category terms for the subreddit.",
            "The feed is public and read-only; no API key or authentication is required to view it in a browser. config.defaults pins a representative example subreddit (r/programming) via the committed source.uri; the importer's config schema has no per-subreddit override field, so pointing this manifest at a different subreddit means editing source.uri."
          ]
        },
        "ai.quickdeploy.codegen/policy": {
          "network": [
            "GET https://www.reddit.com/r/programming/.rss for the pinned subreddit's public post Atom feed (read-only, no auth)"
          ],
          "filesystem": [
            "Read committed manifest registry/reddit/feed.mcp.json",
            "Read committed generated test packages/tools/registry-cli/test/generated/feed/reddit.test.ts",
            "Read/write gitignored generated project .generated/mcp-codegen/feed/reddit/"
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
            "name": "query_reddit_feed",
            "deny": false
          }
        ],
        "resources": [
          {
            "from": "feed:item",
            "name": "reddit_feed_item",
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
        "uri": "https://www.reddit.com/r/programming/.rss",
        "type": "http",
        "retrievedAt": "2026-07-09",
        "sourceVersion": "reddit-subreddit-atom-feed",
        "notes": [
          "Reddit publishes a public per-subreddit Atom feed by appending .rss to any subreddit listing URL, e.g. https://www.reddit.com/r/<subreddit>/.rss (also supported per-user, per-multireddit, and per-sort such as /new/.rss or /top/.rss); this is a long-standing, stable Reddit platform feature rather than a page in Reddit's formal Data API developer docs.",
          "Reddit's edge/WAF returns HTTP 403 to automated/unauthenticated fetches of this feed (confirmed via direct curl from this environment: `HTTP/2 403`, content-type text/html anti-bot challenge page), so no fetched-page content digest is pinned here; matches the eBay Trading (QUI-391) and HubSpot (QUI-352) precedent for sources that block unauthenticated automated retrieval.",
          "The feed is standard Atom XML (xmlns=\"http://www.w3.org/2005/Atom\") with one <entry> per post: title, link, author, id, published/updated timestamps, content (HTML snippet), and category terms for the subreddit.",
          "The feed is public and read-only; no API key or authentication is required to view it in a browser. config.defaults pins a representative example subreddit (r/programming) via the committed source.uri; the importer's config schema has no per-subreddit override field, so pointing this manifest at a different subreddit means editing source.uri."
        ]
      },
      "ai.quickdeploy.codegen/policy": {
        "network": [
          "GET https://www.reddit.com/r/programming/.rss for the pinned subreddit's public post Atom feed (read-only, no auth)"
        ],
        "filesystem": [
          "Read committed manifest registry/reddit/feed.mcp.json",
          "Read committed generated test packages/tools/registry-cli/test/generated/feed/reddit.test.ts",
          "Read/write gitignored generated project .generated/mcp-codegen/feed/reddit/"
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
        "name": "query_reddit_feed",
        "deny": false
      }
    ],
    "resources": [
      {
        "from": "feed:item",
        "name": "reddit_feed_item",
        "deny": false
      }
    ],
    "prompts": [],
    "authEnvVars": [],
    "serverEnvVars": []
  },
});
