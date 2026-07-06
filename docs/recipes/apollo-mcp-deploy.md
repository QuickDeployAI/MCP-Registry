# Recipe: deploying Apollo MCP Server (GraphQL, wrap not build)

**Verdict (QUI-248): wrap/watch, do not build a generic `graphql-2-mcp`
importer.** GraphQL is a crowded, vendor-backed category and Apollo already
ships a production-grade, officially maintained MCP server for exactly this.
The action here is a deploy recipe and a registry reference entry, not new
importer code.

## What Apollo MCP Server is

[apollographql/apollo-mcp-server](https://github.com/apollographql/apollo-mcp-server)
is Apollo's official Rust MCP server that fronts any GraphQL endpoint. It
ships an official container image, so there is no Dockerfile to author here —
deployment is "run the image with the right config," not "build one."

It supports three tool-definition modes:

| Mode | Tool shape | When to use |
|---|---|---|
| `.graphql` operation files | One tool per operation file | Default recommendation — see below |
| GraphOS persisted-query manifest | One tool per registered persisted query | Already using GraphOS; want registry-enforced governance (the model can only call vetted operations) |
| Introspection | A single depth-limited, progressive `introspect` tool | Exploratory/ad hoc access to a schema you don't want to hand-curate operations for |

## Deploy recipe

1. **Author or export operation files.** For a curated deployment (the
   recommended path — see below), write one `.graphql` file per operation you
   want exposed as a tool, or export a GraphOS persisted-query manifest if the
   target already uses GraphOS.
2. **Run the official container image** against the target GraphQL endpoint,
   mounting the operation files (or persisted-query manifest) and pointing it
   at the endpoint URL. Follow Apollo MCP Server's own docs for the current
   image tag/registry and config flags — track the image digest actually
   deployed, not `latest`, per this monorepo's general OCI-pinning convention.
3. **Configure auth pass-through.** Apollo MCP Server forwards whatever
   headers/credentials the underlying GraphQL endpoint needs; it does not
   introduce its own auth scheme. Wire real credentials through the shared
   importer-core auth module's conventions (env-sourced, never CLI-visible)
   when QuickDeploy operates the deployment.
4. **Register the deployment.** Add (or update) the `apollo-mcp-server`
   entry in
   [`registry/remote-ref-seeds.json`](../../registry/remote-ref-seeds.json)
   once a concrete QuickDeploy-operated instance exists, promoting it from
   `deploy-recipe` to a server.json entry with the real endpoint.

## Production consensus (why curated operations, not introspection, by default)

Every serious deployment converged on the same shape, and it's worth stating
explicitly since it cuts against the naive "just expose the whole schema"
instinct:

- **Per-operation tools from curated/persisted files** — not whole-schema
  introspection — avoid context explosion and hallucinated queries against
  fields the model half-remembers.
- **Mutations are opt-in**, never on by default: a read-heavy default keeps a
  misbehaving agent from writing data through an exploratory integration.
- **Search-before-introspect**: when introspection is needed at all (the
  exploratory case), do it through a bounded, progressive tool rather than
  dumping the full schema into context in one call.

## When to promote this to a real importer instead

Per QUI-248's promotion trigger: only if a customer needs manifest-uniform
GraphQL access (`spec.select` over operations, the same subsetting vocabulary
used elsewhere in this monorepo's manifests) that Apollo's own config model
can't express, or specifically wants a TypeScript-native engine running
inside `mcp-host` rather than a separate container. Until then, wrapping
Apollo's own server is strictly better than re-implementing it.

## See also

[`docs/recipes/knowledge-2-mcp-comparisons.md`](./knowledge-2-mcp-comparisons.md)
covers the analogous wrap-vs-build decision for the docs/knowledge category.
