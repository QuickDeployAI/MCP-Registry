# ADR 0015: Shared core ownership and publishability

## Status

Accepted - 2026-07-11

## Context

`@quickdeployai/importer-core` and `@quickdeployai/proxy-core` previously existed
in both `QuickDeployAI/monorepo` and `QuickDeployAI/MCP-Registry` with divergent
APIs. The monorepo copies were removed during repository canonicalization, while
the MCP-Registry importers still use their local cores through `workspace:*`.

A public importer cannot depend at runtime on a private workspace-only package:
the importer builds in the workspace but fails when installed from a registry.

## Decision

MCP-Registry is the single source of truth for MCP importer runtime cores,
including `importer-core`, `proxy-core`, and `corpus-core`. New MCP importer and
host work extends these packages here; the product monorepo consumes published
artifacts or catalog output instead of maintaining API-compatible forks.

Shared cores referenced by public packages are themselves public,
release-managed packages with compiled `dist` entrypoints. Public packages may
use `workspace:` dependencies during development only when the target package is
publishable. Private workspace packages remain valid for tests, configuration,
and tooling, but cannot appear in a public package's runtime dependencies.

Registry validation rejects a public package whose runtime `workspace:`
dependency resolves to a private package. This keeps local workspace resolution
from masking an npm installation failure.

## Consequences

- `@quickdeployai/importer-core`, `@quickdeployai/proxy-core`, and
  `@quickdeployai/corpus-core` follow the MCP-Registry Changesets release path.
- MCP runtime API changes are made here rather than mirrored into the monorepo.
- A core may become private only after every public runtime dependent has been
  removed or migrated.
- Development-only dependencies on private workspace configuration packages are
  allowed because they are not installed for consumers.

## References

- MCP-Registry ADR 0014: MCP importer baseline stack
- QuickDeployAI/monorepo ADR 0019: MCP Everywhere repository canonicalization
- Linear QUI-336
