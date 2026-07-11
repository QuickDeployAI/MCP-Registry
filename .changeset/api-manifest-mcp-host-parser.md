---
"@quickdeployai/api-manifest-2-mcp": minor
---

Add `ArtifactParser` support: `createApiManifestArtifactParser`/`apiManifestArtifactParser` project an API Manifest into `api-contract`/`tool` capabilities and (given runtime options) an executable MCP tool surface, and `resolveApiManifestDependencies`/`buildApiManifestTools` now accept a `dependencyKey` to scope resolution to a single dependency. Wired into `@quickdeployai/mcp-host`'s default artifact parsers, configured per-projection via `dependencyKey`/`deploymentBaseUrlOverride`.
