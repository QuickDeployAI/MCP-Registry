import { describeGeneratedMcpManifest } from "../generated-test-helpers";

describeGeneratedMcpManifest({
  family: "feed",
  provider: "product-hunt",
  manifestPath: "registry/product-hunt/feed.mcp.json",
  manifest: {
    "apiVersion": "quickdeploy.ai/v1",
    "kind": "McpManifest",
    "metadata": {
      "name": "ai.quickdeploy/product-hunt",
      "version": "0.1.0",
      "title": "Product Hunt",
      "description": "Generated feed-2-mcp MCP manifest for Product Hunt product feed.",
      "labels": [
        "feed",
        "generated",
        "product-hunt",
        "read-only",
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
        "uri": "https://www.producthunt.com/feed",
        "digest": "sha256:f199876501e9181b46d3c8be6bc084471ed2ecf16e0077420288cfdb74e32236",
        "ref": "producthunt-atom-feed@2026-07-09"
      },
      "select": {
        "requests": [],
        "grpcMethods": [],
        "pythonFunctions": [],
        "skills": [],
        "knowledgeSources": [],
        "corpusGlobs": [
          "/products/**"
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
          "refreshMinutes": 15,
          "maxItems": 50,
          "includeContent": true
        },
        "ai.quickdeploy.codegen/source": {
          "uri": "https://www.producthunt.com/feed",
          "type": "http",
          "digest": "sha256:f199876501e9181b46d3c8be6bc084471ed2ecf16e0077420288cfdb74e32236",
          "ref": "producthunt-atom-feed@2026-07-09",
          "retrievedAt": "2026-07-09",
          "sourceVersion": "producthunt-atom-feed@2026-07-09",
          "notes": [
            "Official Product Hunt public Atom feed, verified live via direct fetch (application/atom+xml, 200 OK).",
            "Feed content updates continuously as new products are posted; the pinned digest reflects the state at retrieval time.",
            "Canonical source URL: https://www.producthunt.com/feed",
            "Verified source SHA-256 at retrieval: f199876501e9181b46d3c8be6bc084471ed2ecf16e0077420288cfdb74e32236"
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
            "name": "query_product_hunt_feed",
            "deny": false
          }
        ],
        "resources": [
          {
            "from": "feed:item",
            "name": "product_hunt_feed_item",
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
        "uri": "https://www.producthunt.com/feed",
        "type": "http",
        "digest": "sha256:f199876501e9181b46d3c8be6bc084471ed2ecf16e0077420288cfdb74e32236",
        "ref": "producthunt-atom-feed@2026-07-09",
        "retrievedAt": "2026-07-09",
        "sourceVersion": "producthunt-atom-feed@2026-07-09",
        "notes": [
          "Official Product Hunt public Atom feed, verified live via direct fetch (application/atom+xml, 200 OK).",
          "Feed content updates continuously as new products are posted; the pinned digest reflects the state at retrieval time.",
          "Canonical source URL: https://www.producthunt.com/feed",
          "Verified source SHA-256 at retrieval: f199876501e9181b46d3c8be6bc084471ed2ecf16e0077420288cfdb74e32236"
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
        "name": "query_product_hunt_feed",
        "deny": false
      }
    ],
    "resources": [
      {
        "from": "feed:item",
        "name": "product_hunt_feed_item",
        "deny": false
      }
    ],
    "prompts": [],
    "authEnvVars": [],
    "serverEnvVars": []
  },
});
