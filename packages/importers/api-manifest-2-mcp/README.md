# @quickdeployai/api-manifest-2-mcp

Microsoft API Manifest to MCP importer utilities and standalone server on the
QuickDeploy baseline.

```bash
npx @quickdeployai/api-manifest-2-mcp serve \
  --manifest ./api-manifest.json \
  --port 3000
```

The server exposes the selected dependency operations over stdio and
streamable HTTP at `/mcp`. `--base-url dependencyKey=https://override.example`
overrides a manifest deployment base URL.

The canonical registry example is
[`registry/quickdeploy/api-manifest-petstore.ard.json`](../../../registry/quickdeploy/api-manifest-petstore.ard.json)
with its adjacent projection. It runs through `mcp-host`, binds the manifest's
Petstore OAuth requirement to `PETSTORE_OAUTH_TOKEN`, and exposes only the two
requests explicitly listed by the API Manifest even when the resolved OpenAPI
document describes additional operations.

This package loads Microsoft API Manifest documents from file paths, `file:`
URLs, HTTP(S) URLs, inline JSON strings, buffers, or already-parsed objects. It
validates every document with the vendored `ApiManifestSchema` from
`@quickdeployai/registry-schemas` and projects request selections into the
existing `McpManifestSelect` shape. It can also resolve each dependency's
`apiDescriptionUrl` into an OpenAPI document and filter that document down to
the operations named by the dependency `requests`.

```bash
vp run typecheck -F @quickdeployai/api-manifest-2-mcp
vp run test -F @quickdeployai/api-manifest-2-mcp
vp run @quickdeployai/registry-cli#check:generated
vp run @quickdeployai/registry-cli#registry:validate
```

```ts
import {
  apiManifestToSelect,
  loadApiManifest,
  resolveApiManifestDependencies,
} from "@quickdeployai/api-manifest-2-mcp";

const manifest = await loadApiManifest("fixtures/petstore.apimanifest.json");
const select = apiManifestToSelect(manifest);
const dependencies = await resolveApiManifestDependencies(manifest);
```
