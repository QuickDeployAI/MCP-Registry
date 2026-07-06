# @quickdeployai/corpus-core

Shared stateful corpus primitives for MCP importers that ingest source records and expose query/search tools.

The generic item model is:

- `NativeItem`: a top-level `Record<string, unknown>` from any source adapter.
- `StoredItem<TItem>`: the native item plus `_id` and `_fetchedAt` metadata.
- `StoreAdapter<TItem>`: the persistence contract for memory, NDJSON file, and LanceDB-backed vector stores.
- `ObservedFeedSchema`: runtime field inference over actual stored records, including select/filter/search/sort capabilities.
- `FeedQuery`: filter, search, sort, pagination, and projection input for query tools.
- `ContentRef`: offloads large string fields behind resource URIs instead of returning them inline.

The package is source-format neutral even though the first consumer is `feed-2-mcp`; future knowledge, AsyncAPI receive-side, and git documentation importers can store their native records without hardcoded feed fields.

Importers own ingestion, source-specific metadata mapping, MCP tool names, and user-facing prompts. `corpus-core` owns storage, schema inference, full-text filtering, result projection, large-field offload, and optional embedding-backed search.
