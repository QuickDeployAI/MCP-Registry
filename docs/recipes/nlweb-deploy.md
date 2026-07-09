# Recipe: deploying an NLWeb instance as an MCP server

[NLWeb](https://github.com/nlweb-ai/NLWeb) is not an importer target — there
is nothing to convert. Every NLWeb instance **is already** an MCP server: it
ships a first-class `ask` tool over MCP (alongside its REST `/ask` endpoint)
that answers natural-language questions against the site's own content. This
recipe covers packaging and deploying a QuickDeploy-hosted instance and
registering it as a remote reference, not building an importer.

## What NLWeb actually is

NLWeb ingests a site's existing structured data — `schema.org` markup and/or
an RSS/Atom feed — embeds it into a vector backend, and serves natural
language queries over that index. It is deliberately schema-driven: no
scraping or custom parsing per site, just the structured data the site
already publishes.

```
site (schema.org markup / RSS feed) → NLWeb (embed + index) → MCP `ask` tool
```

Supported vector backends include Qdrant, Milvus, Azure AI Search, and
Snowflake; any one of these can back a QuickDeploy-hosted instance.

## Deploy recipe

1. **Pick a content source.** Point NLWeb at the target site's `schema.org`
   structured data or RSS feed. No custom adapter is needed — this is the
   entire reason NLWeb doesn't fit the importer model used elsewhere in this
   monorepo (there is no `x` → OpenAPI/manifest transform step; NLWeb *is*
   the server).
2. **Provision a vector backend.** For a QuickDeploy-hosted instance, default
   to a managed Qdrant instance for new deployments (lowest operational
   overhead of the supported backends); Azure AI Search is the better choice
   when the target already lives in an Azure tenant.
3. **Configure and run.** Follow NLWeb's own setup docs to point it at the
   content source and vector backend, then start the server. It exposes:
   - `POST /ask` — REST natural-language query endpoint.
   - `/mcp` — MCP endpoint (streamable HTTP) exposing the same capability as
     an `ask` tool.
4. **Register the deployment.** Add (or update) the `nlweb` entry in
   [`../registry/seeds/remote-ref-seeds.json`](../../docs/registry/seeds/remote-ref-seeds.json)
   with the deployed instance's `/mcp` URL once it's live. The seed entry
   checked in here is a `deploy-recipe` disposition (self-hosted, no fixed
   public endpoint) until a QuickDeploy-hosted instance exists, at which
   point it should be promoted to a concrete server.json entry with the real
   endpoint.

## Auth and operational notes

- No credentials are required to *query* a deployed instance beyond whatever
  auth QuickDeploy puts in front of it (NLWeb itself doesn't gate `/ask` or
  `/mcp`).
- Indexing/embedding time credentials (vector backend API keys, any source
  API keys for non-public content) belong to the deployment, not the MCP
  client — never exposed through the `ask` tool's parameters.
- Re-indexing cadence is a deployment concern: schedule embed refreshes
  against how often the underlying schema.org/RSS content changes.

## See also

[`docs/recipes/knowledge-2-mcp-comparisons.md`](./knowledge-2-mcp-comparisons.md)
covers when a self-hosted NLWeb deployment is the right call versus
`knowledge-2-mcp` or a hosted docs-chat SaaS.
