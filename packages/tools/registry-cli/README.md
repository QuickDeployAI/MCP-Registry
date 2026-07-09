# @quickdeployai/registry-cli

Builds the canonical MCP `servers.json` catalog and the legacy
`registry/index.json` compatibility artifact consumed by the marketplace ARD
git-catalog source.

For the registry authoring flow before running these commands, see
[`docs/registry/ard-projection-authoring-guide.md`](../../docs/registry/ard-projection-authoring-guide.md).

```bash
vp run @quickdeployai/registry-cli#build:registry
vp run @quickdeployai/registry-cli#check:generated
vp run @quickdeployai/registry-cli#registry:validate
vp run @quickdeployai/registry-cli#validate:remotes
vp exec -F @quickdeployai/registry-cli registry-cli config-schema --importer openapi-2-mcp
vp exec -F @quickdeployai/registry-cli registry-cli bake --manifest manifests/petstore.mcp.yaml --image ghcr.io/quickdeployai/mcp-petstore --digest sha256:<64-hex>
```

Sources:

- `servers/**/server.json`
- `packages/importers/**/server.json`
- `manifests/*.ard.json` plus sibling `manifests/*.projection.json`
- `manifests/remotes/*.server.json` except underscore-prefixed authoring templates

The legacy index intentionally preserves the `agents[].summary` shape expected
by `apps/quick-deploy-marketplace/supabase/functions/_shared/ard-sources.ts`.

Projection-backed entries are compiled by deriving the importer engine from the
ARD entry media type, then applying the sibling `McpProjectionConfig` selection,
auth, config, expose, and deployment settings. Projection config is validated
against the referenced importer's registered `spec.config` JSON Schema before
`servers.json` is generated. The `config-schema` command prints those
importer-owned schemas; unknown fields and default type mismatches fail with
errors naming the importer and config field.

`registry-cli validate` checks committed registry inputs for supported
`server.json` schema vintages, reverse-DNS server names, exact semantic versions,
duplicate server names, MCPB `fileSha256` pins, OCI digest pins, and ARD
entry/projection schema compliance before publication.

`registry-cli bake` prints a standalone official `server.json` entry for a
legacy `McpManifest` that has been baked into an OCI image. The emitted package
identifier is digest-pinned as `<image>@sha256:<digest>`, points `mcp-host` at
the baked `/app/manifest.mcp.yaml`, preserves required environment variables,
and records the source manifest path plus bake provenance under
`_meta["ai.quickdeploy.registry/bake"]`.

`registry-cli validate-remotes` builds the current registry, then performs an
MCP `initialize` handshake against every `remotes[].url`. Endpoints that return
a `401` or `403` authentication challenge pass as reachable auth-gated remotes;
dead endpoints, malformed MCP responses, and unexpected HTTP failures fail the
run.

Remote-only hosted MCP entries are authored from
`manifests/remotes/_template.server.json` and documented in
`docs/registry/remote-ref-authoring.md`. Template files are schema-validated but
excluded from generated `servers.json`.

## Scaffolding

```bash
vp exec -F @quickdeployai/registry-cli registry-cli scaffold importer widgets-2-mcp
vp exec -F @quickdeployai/registry-cli registry-cli scaffold manifest openapi-2-mcp \
  --name widgets --source-type http --source-uri https://widgets.example/openapi.json \
  --request GET:/widgets/{id} --auth bearer:WIDGETS_API_TOKEN
```

`scaffold importer <name>` creates `packages/importers/<name>` following the
pure-library convention every hardened importer uses (`openapi-2-mcp`,
`postman-2-mcp`, `wsdl-2-mcp`): a tool-builder function wired to
`@quickdeployai/importer-core` auth, a passing vitest suite, a reference
Dockerfile, and a README with next steps. `tsc --noEmit` and `vitest run` pass
immediately on the generated package.

`scaffold manifest <importer>` remains a legacy helper that writes a
schema-valid `McpManifest`. New committed registry entries should use an ARD
entry plus sibling projection config instead. Both subcommands prompt
interactively for missing required values when stdin is a TTY, and otherwise
fail fast with the missing flag name.
