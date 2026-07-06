# Release and Versioning

The registry publishes exact package versions. Do not publish a registry entry
that points at `latest`, a semver range, or an npm dist-tag. Every public MCP
server or importer release must update the package version, `server.json`, and
`registry/index.json` in the same pull request.

## Release Flow

1. Add a changeset for each public package under `packages/mcp-importers/*` or
   `packages/mcps/*`.
2. Run `pnpm version:packages` to apply changesets and then validate registry
   version sync.
3. Update the matching `server.json` in the same PR when a package version
   changes.
4. Update `registry/index.json` so the entry summary version matches the
   referenced `server.json`.
5. Run `pnpm check` before opening the PR.
6. Merge only after the PR `Workspace check` job passes.
7. Main branch CI publishes the validated release commit with
   `pnpm publish:packages` and the GitHub Packages `GITHUB_TOKEN`.

`@quickdeployai/openapi-2-mcp` is marked private and excluded from automated
Changesets publish until its existing GitHub Package access is transferred from
the standalone repository to this registry repository. Keep version and registry
validation in place, but do not let that legacy package permission block
publishing new workspace-owned packages.

Legacy servers under `servers/*` are not workspace packages yet, but they are
still validated. Their local `package.json`, `server.json`, and
`registry/index.json` versions must stay identical until those packages migrate
to `packages/mcps/*`.

## OCI Images

OCI package entries must be tagged with the exact package version and must
record the immutable digest produced by the publish job. Use the package version
as the image tag and store the resulting digest in the package entry:

```json
{
  "registryType": "oci",
  "identifier": "ghcr.io/quickdeployai/mcp-docs:1.2.3",
  "version": "1.2.3",
  "digest": "sha256:..."
}
```

`pnpm registry:validate` fails OCI entries without a `sha256` digest or without
the exact version tag.

## Prereleases

Importer prereleases use a Changesets prerelease mode such as `next` and publish
to the npm `next` dist-tag only. Do not add or update registry entries for
prerelease-only versions. A registry entry is published after the package exits
prerelease and has a stable exact version.

## Validation Gate

Run the registry gate locally:

```bash
pnpm registry:validate
```

The gate checks:

- every `server.json` has an exact semver `version`
- every package entry has an exact semver `version`
- local package versions match their referenced `server.json`
- `registry/index.json` summary versions match their referenced `server.json`
- OCI package entries include a `sha256` digest and version tag
