# MCP-Registry

Official repo for Quick Deploy AI - MCP servers.

This is a trusted public source for the QuickDeploy marketplace: the platform
reads it to populate official default MCP server entries in the capability
registry.

## Layout

Each server lives at `servers/<server-name>/` on `main`:

- `server.json` — MCP server metadata per the
  [official MCP registry schema](https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json).
- `index.mjs` — the runnable stdio server implementation.
- `package.json` — npm package with a `bin` entry for `npx` execution.

`registry/index.json` is the machine-readable catalog consumed by the
marketplace ARD endpoints
(`https://raw.githubusercontent.com/QuickDeployAI/MCP-Registry/main/registry/index.json`).

## Servers

| Server | Package | Purpose |
| ------ | ------- | ------- |
| [quickdeploy-docs](servers/quickdeploy-docs/) | `@quickdeployai/mcp-docs` | Queryable official docs (llms.txt index + markdown pages). No auth. |
| [quickdeploy-control-plane](servers/quickdeploy-control-plane/) | `@quickdeployai/mcp-control-plane` | Tenant deployment lifecycle via the Control-Plane API. Requires `QDAI_API_TOKEN`. |
| [quickdeploy-admin](servers/quickdeploy-admin/) | `@quickdeployai/mcp-admin` | Org/enterprise governance: policies, approvals, budgets, audit events. Requires `QDAI_API_TOKEN`. |

## Running a server

```bash
cd servers/quickdeploy-docs
npm install
node index.mjs   # speaks MCP over stdio
```

Or once published: `npx @quickdeployai/mcp-docs`.

Servers that call the Control-Plane API read `QDAI_API_TOKEN` (service-account
bearer token; see https://api.quickdeploy.ai/auth.md) and optional
`QDAI_API_BASE` from the environment. Tokens are never accepted as tool
arguments.

## Adding a server

1. Create `servers/<name>/` with `server.json`, `package.json`, and the
   implementation. Keep `name` in `server.json` under the `ai.quickdeploy/`
   namespace.
2. Add a summary entry to `registry/index.json` with `is_official: true`.
3. Verify the server responds to `initialize`, `tools/list`, and a
   representative `tools/call` over stdio before merging.
