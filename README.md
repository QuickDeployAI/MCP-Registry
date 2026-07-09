# MCP-Registry

Official repo for Quick Deploy AI - MCP servers.

This is a trusted public source for QuickDeploy MCP server metadata. The
platform reads `servers.json` to populate official default MCP entries.

## Workspace Layout

This repository is bootstrapped as a pnpm + Turborepo workspace for registry
tools, shared MCP importer/runtime libraries, first-party MCP packages, and
registry utilities.

Workspace package lanes:

- `packages/core/*` — shared libraries and workspace config used by importers
  and registry tools.
- `packages/importers/*` — converters that turn external API or content
  shapes into MCP packages.
- `packages/runtime/*` — shared runtime services for generated and baked MCP
  packages.
- `packages/schemas/*` — MCP registry and manifest schemas shared by the repo.
- `packages/tools/*` — repo-local CLIs and validation tools.

Common workspace commands:

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm lint
pnpm test
pnpm check
```

The placeholder package at `packages/core/workspace-smoke` keeps the Turbo
pipeline checking the expected workspace layout.

## Registry Layout

Authored registry entries live under `registry/<provider>/`:

- `*.mcp.json`, `*.mcp.yaml`, or `*.mcp.yml` — QuickDeploy `McpManifest`
  sources compiled into hosted `mcp-host` entries.
- `*.server.json` — externally hosted MCP server manifests that already match
  the official MCP registry schema.

`registry/index.json` is generated locally by `registry-cli build` as a source
index and is intentionally ignored by Git. `servers.json` is the generated
machine-readable MCP catalog
(`https://raw.githubusercontent.com/QuickDeployAI/MCP-Registry/main/servers.json`).

## Adding a server

1. Add a provider folder under `registry/` if one does not already exist.
2. Add either a direct MCP server manifest (`*.server.json`) or a QuickDeploy
   `McpManifest` (`*.mcp.json`/`*.mcp.yaml`) for the API or capability exposed
   by that provider.
3. Run `pnpm --filter @quickdeployai/registry-cli build:registry` to regenerate
   `servers.json`.
4. Run `pnpm --filter @quickdeployai/registry-cli registry:validate` before
   merging.
