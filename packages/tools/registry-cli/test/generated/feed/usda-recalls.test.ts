import { describeGeneratedMcpManifest } from "../generated-test-helpers";

describeGeneratedMcpManifest({
  family: "feed",
  provider: "usda-recalls",
  manifestPath: "registry/usda-recalls/feed.mcp.json",
  manifest: {
    "apiVersion": "quickdeploy.ai/v1",
    "kind": "McpManifest",
    "metadata": {
      "name": "ai.quickdeploy/usda-recalls",
      "version": "0.1.0",
      "title": "USDA Recalls",
      "description": "Generated feed-2-mcp MCP manifest for USDA FSIS recall and public health alerts.",
      "labels": [
        "feed",
        "food-safety",
        "generated",
        "government",
        "recalls",
        "rss",
        "usda-recalls"
      ]
    },
    "spec": {
      "importer": {
        "engine": "feed-2-mcp",
        "versionRange": "^0.1.0"
      },
      "source": {
        "type": "http",
        "uri": "http://www.fsis.usda.gov/RSS/usdarss.xml"
      },
      "select": {
        "requests": [],
        "grpcMethods": [],
        "pythonFunctions": [],
        "skills": [],
        "knowledgeSources": [],
        "corpusGlobs": [
          "/recalls/**"
        ]
      },
      "auth": [],
      "config": {
        "schema": {
          "type": "object",
          "properties": {
            "refreshMinutes": {
              "type": "number",
              "description": "Polling interval in minutes for refreshing the FSIS recall feed."
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
          "refreshMinutes": 30,
          "maxItems": 200,
          "includeContent": true
        },
        "ai.quickdeploy.codegen/source": {
          "uri": "http://www.fsis.usda.gov/RSS/usdarss.xml",
          "type": "http",
          "retrievedAt": "2026-07-09",
          "sourceVersion": "rss-2.0",
          "notes": [
            "Official USDA Food Safety and Inspection Service (FSIS) recall/public-health-alert RSS feed, referenced from the FSIS recalls page https://www.fsis.usda.gov/recalls and the FSIS news feeds & subscriptions page https://www.fsis.usda.gov/news-events/news-feeds-subscriptions.",
            "fsis.usda.gov returns HTTP 403 to automated/unauthenticated fetches (confirmed via direct curl from this environment), so no fetched-page content digest is pinned here - matches the eBay Trading (QUI-391) and HubSpot (QUI-352) precedent for sources that block unauthenticated automated retrieval.",
            "FSIS also launched a Recall and Public Health Alert API for structured access; the RSS feed remains the documented lightweight subscription channel and is used here for consistency with the other feed-2-mcp catalog entries.",
            "The feed is public; no authentication is required."
          ]
        },
        "ai.quickdeploy.codegen/policy": {
          "network": [
            "GET http://www.fsis.usda.gov/RSS/usdarss.xml for source retrieval and periodic polling"
          ],
          "filesystem": [
            "Read committed manifest registry/usda-recalls/feed.mcp.json",
            "Read committed generated test packages/tools/registry-cli/test/generated/feed/usda-recalls.test.ts",
            "Read/write gitignored generated project .generated/mcp-codegen/feed/usda-recalls/"
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
            "name": "query_usda_recalls_feed",
            "deny": false
          }
        ],
        "resources": [
          {
            "from": "feed:item",
            "name": "usda_recalls_feed_item",
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
        "uri": "http://www.fsis.usda.gov/RSS/usdarss.xml",
        "type": "http",
        "retrievedAt": "2026-07-09",
        "sourceVersion": "rss-2.0",
        "notes": [
          "Official USDA Food Safety and Inspection Service (FSIS) recall/public-health-alert RSS feed, referenced from the FSIS recalls page https://www.fsis.usda.gov/recalls and the FSIS news feeds & subscriptions page https://www.fsis.usda.gov/news-events/news-feeds-subscriptions.",
          "fsis.usda.gov returns HTTP 403 to automated/unauthenticated fetches (confirmed via direct curl from this environment), so no fetched-page content digest is pinned here - matches the eBay Trading (QUI-391) and HubSpot (QUI-352) precedent for sources that block unauthenticated automated retrieval.",
          "FSIS also launched a Recall and Public Health Alert API for structured access; the RSS feed remains the documented lightweight subscription channel and is used here for consistency with the other feed-2-mcp catalog entries.",
          "The feed is public; no authentication is required."
        ]
      },
      "ai.quickdeploy.codegen/policy": {
        "network": [
          "GET http://www.fsis.usda.gov/RSS/usdarss.xml for source retrieval and periodic polling"
        ],
        "filesystem": [
          "Read committed manifest registry/usda-recalls/feed.mcp.json",
          "Read committed generated test packages/tools/registry-cli/test/generated/feed/usda-recalls.test.ts",
          "Read/write gitignored generated project .generated/mcp-codegen/feed/usda-recalls/"
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
        "name": "query_usda_recalls_feed",
        "deny": false
      }
    ],
    "resources": [
      {
        "from": "feed:item",
        "name": "usda_recalls_feed_item",
        "deny": false
      }
    ],
    "prompts": [],
    "authEnvVars": [],
    "serverEnvVars": []
  },
});
