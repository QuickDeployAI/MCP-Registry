# When to use knowledge-2-mcp vs. the alternatives

`knowledge-2-mcp` is one point in a crowded "docs/knowledge over MCP" space.
This doc is a decision aid, not a ranking — pick based on where the content
already lives and who operates the result.

| Option | What it actually is | Choose it when |
|---|---|---|
| **`knowledge-2-mcp`** (this repo) | Self-hosted corpus engine: ingest a markdown tree, [OpenWiki](https://github.com/langchain-ai/openwiki) output, or an Open Knowledge Format bundle; serve `search`/`get_doc` with citations. | The content is already committed markdown (or can be), and you want a QuickDeploy-operated server with no third-party account, no external network call at query time, and full control over chunking/citation format. |
| **[GitMCP](https://github.com/idosal/git-mcp)** | Zero-install: prefix any GitHub repo/pages URL with `gitmcp.io` and get an MCP server over that repo's docs/README/code on demand. No deploy, no ingestion step. | You want *instant* access to one specific public repo's docs and don't want to operate anything — the tradeoff is no control over chunking, ranking, or citation shape, and it depends on GitMCP's hosted service. |
| **mcpdoc** ([langchain-ai/mcpdoc](https://github.com/langchain-ai/mcpdoc)) | Thin MCP server that serves docs listed in one or more `llms.txt` files — fetches and returns pages, doesn't build a search index. | The target already publishes an `llms.txt` (or you can hand-author one) and page-level fetch is enough; you don't need full-text search/ranking across a large corpus, just "list pages, fetch one." |
| **[Context7](https://github.com/upstash/context7)** | Hosted, versioned library-documentation resolver (`resolve-library-id` → `query-docs`) covering a large pre-indexed catalog of public libraries/frameworks. | The content is a well-known public library/framework already in Context7's catalog — you get versioned, current docs with zero ingestion work, at the cost of not controlling what's indexed or how. |
| **Hosted docs-chat SaaS** (Mintlify, Kapa.ai, Inkeep) | Commercial platforms that ingest your docs (usually already-hosted docs sites) and offer a hosted Q&A/chat API, increasingly with an MCP front door. | You already pay for one of these to power in-product docs search/chat and just want the existing index reachable over MCP too — not a fit when you don't want a third-party account or your docs contain anything that shouldn't leave your infrastructure. |
| **NLWeb** ([nlweb-ai/NLWeb](https://github.com/nlweb-ai/NLWeb); see [`nlweb-deploy.md`](./nlweb-deploy.md)) | Every instance *is* an MCP server built directly on a site's own `schema.org`/RSS structured data plus a vector backend — no importer step. | The target is a full site (not a docs subtree) that already publishes rich `schema.org` markup or an RSS feed, and natural-language `ask` over the whole site — not citation-per-chunk search — is the goal. |
| **LlamaCloud / LlamaParse** (`mcp.llamaindex.ai/mcp`; see `llamacloud-mcp` seed in [`registry/remote-ref-seeds.json`](../../registry/remote-ref-seeds.json)) | Hosted parsing + retrieval platform (Parse/Classify/Extract/Split) behind a remote MCP endpoint, WorkOS OAuth. | Source documents are messy/non-markdown (PDFs, scanned docs, complex layouts) and need LlamaParse-grade extraction before anything is queryable — `knowledge-2-mcp` assumes clean markdown/OKF input and does no document parsing of its own. |

## Decision shortcut

1. **Content is already markdown you control** → `knowledge-2-mcp`.
2. **One public GitHub repo, no ingestion wanted** → GitMCP.
3. **You control an `llms.txt`, page fetch is enough** → mcpdoc.
4. **A well-known public library already in Context7's catalog** → Context7.
5. **A whole site with schema.org/RSS, "ask the site" semantics** → NLWeb.
6. **Source docs are PDFs/scanned/complex layouts needing extraction first** → LlamaCloud/LlamaParse.
7. **Already paying for a hosted docs-chat vendor** → use that vendor's MCP front door instead of standing up a parallel index.

None of these are mutually exclusive with `knowledge-2-mcp`: LlamaParse output,
for instance, can be normalized to markdown and then ingested by
`knowledge-2-mcp` for citation-grade search — see the [OpenWiki
recipe](./openwiki-to-mcp.md) for the same "external tool writes markdown,
knowledge-2-mcp serves it" pattern applied to a different upstream.
