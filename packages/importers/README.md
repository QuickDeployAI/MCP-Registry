# packages/importers

MCP importer packages that turn some other integration surface (OpenAPI,
gRPC, AsyncAPI, WSDL, Postman collections, Agent Skills, ...) into MCP tools,
prompts, and resources.

## Shared container image (Dockerfile.importer)

Every importer here can be packaged into an OCI image with the shared,
parameterized template at [`Dockerfile.importer`](./Dockerfile.importer),
using the `PACKAGE` build arg to select which importer to build. Build from
the **repository root** (pnpm needs the workspace lockfile to resolve
`workspace:*` dependencies):

```sh
docker build -f packages/importers/Dockerfile.importer \
  --build-arg PACKAGE=openapi-2-mcp \
  -t ghcr.io/quickdeployai/openapi-2-mcp:dev .
```

The template is multi-stage:

1. **build** — `pnpm install --filter "@quickdeployai/<package>..."`, then
   runs the package's own `build` script if it has one (e.g.
   `agent-skills-2-mcp`'s `tsc`), then `pnpm deploy --prod` into a
   self-contained `/out`.
2. **tsx-runtime** — a tiny, package-independent stage that provisions `tsx`
   into its own `node_modules` (kept separate from `/out` so installing it
   never triggers npm to re-run some other, already-`--prod`-pruned
   dependency's lifecycle script against the deployed tree).
3. **runtime** — copies `/out` plus the `tsx` `node_modules`, drops privileges
   to `node`, and runs [`docker-entrypoint.sh`](./docker-entrypoint.sh).

The entrypoint picks the right way to run the package: if the build stage
produced a compiled `dist/index.js` (i.e. the package has a real `build`
script), that runs directly. Otherwise — true for most importers today, which
export TypeScript source only (`package.json` `"exports"` point at
`./src/*.ts`, `tsconfig.json` has `"noEmit": true`) — the entrypoint runs the
package's `src/index.ts` straight through `tsx`, the same execution model
`packages/runtime/mcp-host/Dockerfile` uses for its own CLI
(`node --import tsx src/cli.mts`).

`Dockerfile.importer` is the canonical package-local template for new
`packages/importers/*` image entries. The root
[`docker/importer-node22.Dockerfile`](../../docker/importer-node22.Dockerfile)
is a separate CI runtime wrapper used by
[`.github/workflows/importer-images.yml`](../../.github/workflows/importer-images.yml)
for executable importer smoke tests and digest-artifact publishing. Do not add a
new importer to the root wrapper unless it needs that workflow's
`PACKAGE_FILTER`/`PACKAGE_ENTRYPOINT` contract.

### Adopting it for a new importer

A new `packages/importers/<name>` package needs nothing extra to be
buildable through this template — no per-package Dockerfile required. Just:

1. Make sure any workspace dependency it needs lives under `packages/core` or
   `packages/schemas/registry-schemas` (those are the two shared directories the
   template's build stage copies unconditionally); if a future importer needs
   a workspace package outside those two, add a `COPY` line for it in
   `Dockerfile.importer`.
2. If the package should ship compiled JS instead of running via `tsx`, give
   it a `build` script (see `agent-skills-2-mcp/package.json`) — the template
   detects and runs it automatically (`--if-present`-style: no `build` script
   is not an error).
3. Add it to the matrix in `.github/workflows/mcp-importer-images.yml` so the
   package-template workflow builds it on PRs and, on `main`, publishes its
   package image.
4. If the importer is an executable binary that must also feed digest-pinned
   registry artifacts, add a separate row to `.github/workflows/importer-images.yml`
   with `PACKAGE_FILTER`, `PACKAGE_ENTRYPOINT`, image name, and a smoke command.

If a package instead needs a genuinely different build (e.g. no workspace
dependency at all, like `agent-skills-2-mcp`, whose existing
[`Dockerfile`](./agent-skills-2-mcp/Dockerfile) is a plain, workspace-free
`npm install`), keep its own Dockerfile and point the CI matrix entry's
`dockerfile`/`context` at it instead of the shared template — see the
`agent-skills-2-mcp` row in the workflow for the pattern.

### Publishing & digest pinning

Published tags should be promoted by digest, the same convention
`packages/runtime/mcp-host/Dockerfile` documents and
`packages/tools/registry-cli`'s `bake` command already implements for
mcp-host-hosted manifests (see
`packages/tools/registry-cli/src/registry-build.ts`,
`compileBakedManifestToServerJson`, and the `bake` CLI subcommand in
`packages/tools/registry-cli/src/cli.mts`):

```
ghcr.io/quickdeployai/<package>@sha256:<digest>
```

`.github/workflows/mcp-importer-images.yml` builds the package-template image
matrix on every PR (build-only, no push) and, on merge to `main`, builds and
pushes each package image to GHCR through `reusable-docker-build.yml`.

`.github/workflows/importer-images.yml` is the digest-artifact workflow for the
root `docker/importer-node22.Dockerfile` wrapper. It builds the executable
importers listed in its own matrix, runs their smoke commands on PRs, and on
`main` writes `registry/oci-image-digests.json` before rebuilding registry
artifacts. Use it when a registry entry needs the workflow's digest-pinned OCI
write-back path; otherwise use the package-template workflow above.

## Known gaps (found while wiring up QUI-180)

- `packages/importers/feed-2-mcp` does not exist in this repository. The
  feed-shaped registry example (`manifests/product-feed.mcp.json`) runs through
  `knowledge-2-mcp` (see `packages/knowledge-core` and
  `docs/adr/0016-knowledge-2-mcp-corpus-engine.md`), not a `feed-2-mcp`
  importer package. `Dockerfile.importer` builds any package under
  `packages/importers/*` generically, so it is ready to use the moment
  such a package exists — nothing else needs to change.
- Most importers (`openapi-2-mcp`, `grpc-2-mcp`, `asyncapi-2-mcp`,
  `wsdl-2-mcp`, `postman-2-mcp`) are TypeScript **libraries** consumed by
  `packages/runtime/mcp-host` at the runtime boundary (`openapi-2-mcp`'s README says
  as much directly), not standalone MCP servers — they export functions, not
  a running server. Their images build and run cleanly (verified locally;
  see below), but "serving over stdio" only applies to importers that
  actually construct and start an MCP `Server`, which today is only
  `agent-skills-2-mcp`.
- `agent-skills-2-mcp` does construct and start a real MCP server, but it
  currently throws at startup (`Error: Schema is missing a method literal`)
  because `src/tools.ts`, `src/resources.ts`, and `src/prompts.ts` call
  `server.setRequestHandler({ method: "..." } as any, ...)` with a plain
  object instead of the SDK's real Zod request schemas (e.g.
  `ListToolsRequestSchema` from `@modelcontextprotocol/sdk/types.js`). This
  reproduces identically with its own existing Dockerfile (unmodified), so
  it predates and is unrelated to this Dockerfile/CI work — flagging it here
  since it blocks a true end-to-end stdio smoke test until fixed.
- `har-2-mcp` has no `package.json` yet (only a `fixtures/` directory), so it
  is not part of the CI matrix.
