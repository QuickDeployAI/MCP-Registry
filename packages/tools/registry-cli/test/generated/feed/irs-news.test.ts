import { describeGeneratedMcpManifest } from "../generated-test-helpers";

describeGeneratedMcpManifest({
  family: "feed",
  provider: "irs-news",
  manifestPath: "registry/irs-news/feed.mcp.json",
  manifest: {
    "apiVersion": "quickdeploy.ai/v1",
    "kind": "McpManifest",
    "metadata": {
      "name": "ai.quickdeploy/irs-news",
      "version": "0.1.0",
      "title": "IRS News",
      "description": "Generated feed-2-mcp MCP manifest for IRS news releases feed.",
      "labels": [
        "feed",
        "generated",
        "irs-news",
        "news",
        "read-only",
        "tax"
      ]
    },
    "spec": {
      "importer": {
        "engine": "feed-2-mcp",
        "versionRange": "^0.1.0"
      },
      "source": {
        "type": "http",
        "uri": "https://www.irs.gov/newsroom",
        "digest": "sha256:3c2fe7a6826a0d21c0610b2d0dfe6d0f463c8e0f6a369ec4f2cd5e113d01c184",
        "ref": "irs-newsroom@2026-07-09"
      },
      "select": {
        "requests": [],
        "grpcMethods": [],
        "pythonFunctions": [],
        "skills": [],
        "knowledgeSources": [],
        "corpusGlobs": [
          "/news-releases/**"
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
          "maxItems": 40,
          "includeContent": true
        },
        "ai.quickdeploy.codegen/source": {
          "uri": "https://www.irs.gov/newsroom",
          "type": "http",
          "digest": "sha256:3c2fe7a6826a0d21c0610b2d0dfe6d0f463c8e0f6a369ec4f2cd5e113d01c184",
          "ref": "irs-newsroom@2026-07-09",
          "retrievedAt": "2026-07-09",
          "sourceVersion": "irs-newsroom@2026-07-09",
          "notes": [
            "Official IRS Newsroom page (irs.gov/newsroom) publishes IRS news releases and fact sheets.",
            "A directly fetchable public RSS/XML endpoint for IRS Newswire could not be confirmed at verification time (several plausible paths returned 404); IRS primarily offers newsroom updates via GovDelivery email subscription. This manifest pins the official Newsroom documentation page as the canonical discovery source.",
            "Canonical source URL: https://www.irs.gov/newsroom",
            "Verified source SHA-256: 3c2fe7a6826a0d21c0610b2d0dfe6d0f463c8e0f6a369ec4f2cd5e113d01c184"
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
            "name": "query_irs_news_feed",
            "deny": false
          }
        ],
        "resources": [
          {
            "from": "feed:item",
            "name": "irs_news_feed_item",
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
        "uri": "https://www.irs.gov/newsroom",
        "type": "http",
        "digest": "sha256:3c2fe7a6826a0d21c0610b2d0dfe6d0f463c8e0f6a369ec4f2cd5e113d01c184",
        "ref": "irs-newsroom@2026-07-09",
        "retrievedAt": "2026-07-09",
        "sourceVersion": "irs-newsroom@2026-07-09",
        "notes": [
          "Official IRS Newsroom page (irs.gov/newsroom) publishes IRS news releases and fact sheets.",
          "A directly fetchable public RSS/XML endpoint for IRS Newswire could not be confirmed at verification time (several plausible paths returned 404); IRS primarily offers newsroom updates via GovDelivery email subscription. This manifest pins the official Newsroom documentation page as the canonical discovery source.",
          "Canonical source URL: https://www.irs.gov/newsroom",
          "Verified source SHA-256: 3c2fe7a6826a0d21c0610b2d0dfe6d0f463c8e0f6a369ec4f2cd5e113d01c184"
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
        "name": "query_irs_news_feed",
        "deny": false
      }
    ],
    "resources": [
      {
        "from": "feed:item",
        "name": "irs_news_feed_item",
        "deny": false
      }
    ],
    "prompts": [],
    "authEnvVars": [],
    "serverEnvVars": []
  },
});
