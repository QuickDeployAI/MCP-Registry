# @quickdeployai/mcp-host

Runtime host for an ARD entry plus its MCP projection config. The host loads the
entry's native artifact, resolves an `ArtifactParser` from the entry media type,
applies projection selection and exposure rules, validates config and secret
references, then serves the resulting MCP surface over stdio or streamable HTTP.

```bash
pnpm --filter @quickdeployai/mcp-host start -- run examples/petstore.ard.json --transport streamable-http --port 3000
pnpm --filter @quickdeployai/mcp-host start -- run examples/petstore.ard.json --transport stdio
```

The sibling `*.projection.json` file is inferred from the entry filename. Pass
`--projection <path>` when the files do not share a basename.

## HTTP endpoints

- `GET /healthz` returns process liveness.
- `GET /readyz` returns ARD entry, parser, and transport readiness.
- `POST /` and `POST /mcp` accept JSON-RPC requests.

Non-stdio deployments must make an explicit `projection.deployment.auth`
decision. Omitting it default-denies HTTP requests. Supported modes are
`gateway`, `bearer`, `oauth2-resource`, and explicit `none` for local examples.

Stdio mode uses MCP-style `Content-Length` framed JSON-RPC messages.
