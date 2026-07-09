# @quickdeployai/mcp-host

Runtime host for `McpManifest` documents. It validates a manifest, resolves an
importer engine, checks config and secret references, then serves the resulting
MCP surface over stdio or streamable HTTP.

Registry authors should commit `McpManifest` files under `manifests/` for
hosted importer-backed entries. `mcp-host` accepts those same manifest files for
local fixtures and baked deployments.

```bash
vp run @quickdeployai/mcp-host#start -- run examples/petstore.mcp.yaml --transport streamable-http --port 3000
vp run @quickdeployai/mcp-host#start -- run examples/petstore.mcp.yaml --transport stdio
```

Build the deployable OCI image from the repository root:

```bash
vp run @quickdeployai/mcp-host#image:build
```

Deployment recipes live in `deploy/k8s/` and the runbook is
`docs/deployment/mcp-host.md`. Shared environments must deploy
`ghcr.io/quickdeployai/mcp-host@sha256:<digest>` rather than a mutable tag.

The first cut includes manifest-native adapters for selected HTTP operations,
corpus resources, and skill prompts so examples can run before dedicated
importer packages are extracted. The resolver enforces the manifest
`spec.importer.versionRange`; incompatible or unknown engines fail before the
host starts.

## HTTP endpoints

- `GET /healthz` returns process liveness.
- `GET /readyz` returns manifest and engine readiness.
- `POST /` and `POST /mcp` accept JSON-RPC requests.

## Inbound auth

Non-stdio deployments must make an explicit `deployment.auth` decision. Omitting
the block default-denies JSON-RPC over HTTP with a `WWW-Authenticate: Bearer`
challenge. Local examples can opt out with `type: none`; hosted manifests should
use one of the protected modes:

- `gateway` trusts a QuickDeploy ingress/APIM assertion header after the gateway
  validates JWTs or gateway keys.
- `bearer` checks a static `Authorization: Bearer <token>` value sourced from an
  environment variable such as `MCP_HOST_TOKEN`.
- `oauth2-resource` advertises OAuth 2.1 protected resource metadata in the
  `WWW-Authenticate` challenge. This is the MCP 2026-07-28-compatible path for
  marketplace endpoints; deployments can pair it with a gateway JWT validator or
  a temporary `tokenFrom.env` during local conformance tests.

Generated `servers.json` remotes include the required header placeholders for
protected modes so clients know which header to provide.

## Stdio framing

Stdio mode uses MCP-style `Content-Length` framed JSON-RPC messages.
