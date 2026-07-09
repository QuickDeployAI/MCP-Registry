# ARD projection authoring guide

Committed QuickDeploy registry examples use two sibling files:

- `manifests/<slug>.ard.json` describes the native source artifact with an ARD
  entry: media type, URL, display text, tags, version, and import hints.
- `manifests/<slug>.projection.json` describes the internal MCP projection:
  selection, auth, importer config, exposure policy, and deployment settings.

`registry-cli build` derives the importer engine from the ARD entry `type`,
validates the sibling `McpProjectionConfig`, and emits the canonical
`servers.json` plus the legacy `registry/index.json` compatibility artifact.

If the importer does not exist yet, start with the source-artifact importer
checklist in `CONTRIBUTING.md` before writing ARD/projection examples. A new
importer needs media-type mapping, parser/model tests, MCP projection tests,
config schema, package README, package `server.json`, and only then an ARD entry
plus projection config that exercises the importer through `mcp-host`. OpenRPC
is the preferred worked example for that path because an OpenRPC document maps
one JSON-RPC method to one candidate tool and uses shared importer-core
JSON-RPC/auth helpers.

## ARD Entry

Use a source artifact media type, not an MCP recipe type. Examples:

- OpenAPI: `application/vnd.oai.openapi+json`
- Postman collection: `application/vnd.postman.collection+json`
- HAR: `application/vnd.har+json`
- gRPC descriptor set: `application/protobuf`
- WSDL: `application/wsdl+xml`
- Agent Skills markdown/repo: `application/ai-skill+md`
- RSS feed: `application/rss+xml`
- OKF bundle: `application/vnd.quickdeploy.okf+json`
- Git fixture source: `application/vnd.quickdeploy.git-repository`

```json
{
  "identifier": "urn:air:quickdeploy.ai:mcp:petstore",
  "displayName": "Petstore",
  "type": "application/vnd.oai.openapi+json",
  "description": "Selected Petstore operations exposed as MCP tools.",
  "tags": ["openapi", "petstore"],
  "version": "1.0.0",
  "url": "https://petstore3.swagger.io/api/v3/openapi.json",
  "metadata": {
    "importMode": "operation-level",
    "capabilityKinds": ["api-contract", "tool"]
  }
}
```

## Projection Config

Projection config is internal. It is not the public source artifact; it only
states how QuickDeploy should expose an MCP runtime from the ARD entry.

```json
{
  "apiVersion": "quickdeploy.ai/v1",
  "kind": "McpProjectionConfig",
  "metadata": {
    "name": "ai.quickdeploy/petstore",
    "version": "1.0.0",
    "title": "Petstore",
    "description": "Selected Petstore operations exposed as MCP tools.",
    "labels": ["openapi", "petstore"]
  },
  "spec": {
    "importerVersionRange": "^0.1.0",
    "select": {
      "requests": [{ "method": "get", "uriTemplate": "/pet/{petId}" }]
    },
    "auth": [],
    "expose": {
      "tools": [{ "from": "GET /pet/{petId}", "name": "get_pet" }]
    }
  },
  "deployment": {
    "transport": "streamable-http",
    "auth": { "type": "none" },
    "userConfig": {}
  }
}
```

## Verify

```bash
vp run @quickdeployai/registry-cli#build:registry
vp run @quickdeployai/registry-cli#check:generated
vp run @quickdeployai/registry-cli#registry:validate
```

Run package tests after changing the schema or build path:

```bash
vp run test -F @quickdeployai/registry-cli
vp run typecheck -F @quickdeployai/registry-cli
vp run typecheck -F @quickdeployai/registry-schemas
```
