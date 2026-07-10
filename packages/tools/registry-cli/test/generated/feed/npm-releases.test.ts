import { describeGeneratedMcpManifest } from "../generated-test-helpers";

describeGeneratedMcpManifest({
  family: "feed",
  provider: "npm-releases",
  manifestPath: "registry/npm-releases/feed.mcp.json",
  manifest: {
    "apiVersion": "quickdeploy.ai/v1",
    "kind": "McpManifest",
    "metadata": {
      "name": "ai.quickdeploy/npm-releases",
      "version": "0.1.0",
      "title": "npm Releases",
      "description": "Generated npm registry release history feed MCP catalog manifest.",
      "labels": [
        "dev-tools",
        "feed",
        "generated",
        "javascript",
        "npm",
        "releases"
      ]
    },
    "spec": {
      "importer": {
        "engine": "feed-2-mcp",
        "versionRange": "^0.1.0"
      },
      "source": {
        "type": "http",
        "uri": "https://registry.npmjs.org/express",
        "ref": "npm-registry-releases@2026-07-09"
      },
      "select": {
        "requests": [],
        "grpcMethods": [],
        "pythonFunctions": [],
        "skills": [],
        "knowledgeSources": [],
        "corpusGlobs": [
          "/releases/**"
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
              "description": "Whether full package metadata is exposed in resources."
            }
          }
        },
        "defaults": {
          "refreshMinutes": 15,
          "maxItems": 50,
          "includeContent": true
        },
        "ai.quickdeploy.codegen/source": {
          "uri": "https://registry.npmjs.org/express",
          "type": "http",
          "ref": "npm-registry-releases@2026-07-09",
          "retrievedAt": "2026-07-09",
          "sourceVersion": "npm-registry-releases",
          "notes": [
            "npm does not publish a native RSS/Atom feed for package releases; third-party services such as npmrss.com exist specifically to fill this gap.",
            "npm's own registry infrastructure officially serves full package release/version history as JSON at https://registry.npmjs.org/{name} (documented in the npm/registry API docs); this is npm's genuine first-party releases data source, just JSON rather than RSS/XML.",
            "Verified by direct fetch of https://registry.npmjs.org/express: 288 versions with a full time history (created/modified/per-version timestamps).",
            "The committed source pins a representative, extremely well-known package (express) as the illustrative feed instance; this manifest's URL is parameterizable per-package by substituting {name}.",
            "No content digest is pinned: per the feed-2-mcp family convention (see the committed acme-feed fixture and the merged github-releases/pypi-releases manifests), feed sources are live/mutable data streams, not static spec documents, so only the stable URL pattern and retrieval date are recorded."
          ]
        },
        "ai.quickdeploy.codegen/policy": {
          "network": [
            "GET https://registry.npmjs.org/{name} for feed retrieval (configured upstream)"
          ],
          "filesystem": [
            "Read committed manifest registry/npm-releases/feed.mcp.json",
            "Read committed generated test packages/tools/registry-cli/test/generated/feed/npm-releases.test.ts",
            "Read/write gitignored generated project .generated/mcp-codegen/feed/npm-releases/"
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
            "name": "query_npm_releases_feed",
            "deny": false
          }
        ],
        "resources": [
          {
            "from": "feed:item",
            "name": "npm_releases_feed_item",
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
        "uri": "https://registry.npmjs.org/express",
        "type": "http",
        "ref": "npm-registry-releases@2026-07-09",
        "retrievedAt": "2026-07-09",
        "sourceVersion": "npm-registry-releases",
        "notes": [
          "npm does not publish a native RSS/Atom feed for package releases; third-party services such as npmrss.com exist specifically to fill this gap.",
          "npm's own registry infrastructure officially serves full package release/version history as JSON at https://registry.npmjs.org/{name} (documented in the npm/registry API docs); this is npm's genuine first-party releases data source, just JSON rather than RSS/XML.",
          "Verified by direct fetch of https://registry.npmjs.org/express: 288 versions with a full time history (created/modified/per-version timestamps).",
          "The committed source pins a representative, extremely well-known package (express) as the illustrative feed instance; this manifest's URL is parameterizable per-package by substituting {name}.",
          "No content digest is pinned: per the feed-2-mcp family convention (see the committed acme-feed fixture and the merged github-releases/pypi-releases manifests), feed sources are live/mutable data streams, not static spec documents, so only the stable URL pattern and retrieval date are recorded."
        ]
      },
      "ai.quickdeploy.codegen/policy": {
        "network": [
          "GET https://registry.npmjs.org/{name} for feed retrieval (configured upstream)"
        ],
        "filesystem": [
          "Read committed manifest registry/npm-releases/feed.mcp.json",
          "Read committed generated test packages/tools/registry-cli/test/generated/feed/npm-releases.test.ts",
          "Read/write gitignored generated project .generated/mcp-codegen/feed/npm-releases/"
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
        "name": "query_npm_releases_feed",
        "deny": false
      }
    ],
    "resources": [
      {
        "from": "feed:item",
        "name": "npm_releases_feed_item",
        "deny": false
      }
    ],
    "prompts": [],
    "authEnvVars": [],
    "serverEnvVars": []
  },
});
