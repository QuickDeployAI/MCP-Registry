# ADR 0001: MCP-Registry shared core reconciliation

## Status

Accepted - 2026-07-07

## Context

`QuickDeployAI/monorepo` and `QuickDeployAI/MCP-Registry` both contain
`@quickdeployai/importer-core` and `@quickdeployai/proxy-core`, but the packages
do not expose the same APIs. The monorepo packages are canonical for MCP
Everywhere implementation work under monorepo ADR 0019. MCP-Registry still has
explicitly deferred standalone-server work, and existing registry importers
depend on local shared cores through `workspace:*`.

That is acceptable only when the referenced core package is publishable with the
importer. A public package published with a runtime dependency on a private
workspace package creates an install-time break for `npx` and downstream
consumers.

## Decision

MCP-Registry keeps an intentional compatibility fork of its shared core packages
until each standalone importer is either migrated to the monorepo or explicitly
published from this repository.

- The monorepo remains the source of truth for new MCP Everywhere package
  boundaries, manifests, and host/runtime behavior.
- MCP-Registry shared cores exist only to support packages that are still
  published from MCP-Registry.
- Any MCP-Registry public importer may depend on a workspace core only when that
  core is itself public, included in the Changesets release path, and has a
  package entrypoint suitable for npm consumers.
- Private workspace packages are allowed only for tooling, tests, and local
  configuration; they must not be runtime dependencies of public importers.

## Consequences

`@quickdeployai/importer-core`, `@quickdeployai/proxy-core`, and
`@quickdeployai/corpus-core` are release-managed MCP-Registry packages for as
long as public MCP-Registry importers depend on them. Their APIs may differ from
the monorepo cores, but differences are treated as compatibility debt and not as
permission to extend MCP-Registry as a second canonical implementation line.

Registry validation rejects public workspace packages that depend at runtime on
a private workspace package through `workspace:*`.

## References

- QuickDeployAI/monorepo ADR 0019: MCP Everywhere repo canonicalization
- `docs/release-versioning.md`
- Linear `QUI-336`
