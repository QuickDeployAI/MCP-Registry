import { z } from "zod";

/**
 * The `docs` capability manifest — a first-class knowledge-base / RAG capability,
 * on par with `mcp`, `agent-skill`, `workflow`, etc. A docs capability declares:
 *   - one or more ingestion sources (uploads, websites, OKF bundles, Schema.org,
 *     and SaaS connectors like Google Drive / SharePoint / Box / FTP / …),
 *   - how retrieval runs (vector search; optional lexical),
 *   - which vector store backs it (Supabase by default; pgvector / Upstash /
 *     Pinecone are portable alternatives),
 *   - the embedding model, and
 *   - how it is served (an MCP `ask`/`search` tool and/or a REST `/ask` endpoint).
 *
 * Pure zod + runtime-agnostic so the marketplace, account-hub upload forms, the
 * Deno edge functions, and `platform-api` all validate against the same shape.
 */

/**
 * Portable vector-store backends. Each maps to a `VectorStoreProvider` adapter.
 * `supabase` (the platform's own Postgres + pgvector, accessed via RPC) is the
 * default; the others are bring-your-own alternatives.
 */
export const VectorStoreKindSchema = z.enum(["supabase", "pgvector", "upstash", "pinecone"]);
export type VectorStoreKind = z.infer<typeof VectorStoreKindSchema>;

/** The default vector store — the platform's built-in Supabase vector support. */
export const DEFAULT_VECTOR_STORE_KIND = "supabase" as const;

/** Ingestion source connectors. Each maps to a `SourceConnector` adapter. */
export const SourceConnectorKindSchema = z.enum([
  "file-upload",
  "url",
  "markdown-tree",
  "llms-txt",
  "bounded-crawl",
  "okf",
  "schema-org",
  "google-drive",
  "google-docs",
  "sharepoint",
  "onedrive",
  "box",
  "ftp",
  "notion",
  "confluence",
]);
export type SourceConnectorKind = z.infer<typeof SourceConnectorKindSchema>;

/** Retrieval strategy. Vector search by default; lexical is an alternative. */
export const RetrievalStrategySchema = z.enum(["vector", "lexical"]);
export type RetrievalStrategy = z.infer<typeof RetrievalStrategySchema>;

/** High-level shape of the corpus, mostly informational for the UI. */
export const DocsFormatSchema = z.enum(["okf", "nlweb", "files", "url", "mixed"]);
export type DocsFormat = z.infer<typeof DocsFormatSchema>;

/** Sensible defaults — kept here so callers and the UI agree on them. */
export const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
export const DEFAULT_EMBEDDING_DIMS = 1536;
export const DEFAULT_RETRIEVAL_TOP_K = 8;

/** One configured ingestion source. `config` is connector-specific (and validated
 * by the connector adapter, since credentials/paths vary per provider). */
export const DocsSourceSchema = z.object({
  kind: SourceConnectorKindSchema,
  /** Connector-specific config. Secrets must be keyvault refs, never raw values. */
  config: z.record(z.string(), z.unknown()).default({}),
});
export type DocsSource = z.infer<typeof DocsSourceSchema>;

export const DocsRetrievalConfigSchema = z.object({
  strategy: RetrievalStrategySchema.default("vector"),
  topK: z.number().int().min(1).max(100).default(DEFAULT_RETRIEVAL_TOP_K),
});
export type DocsRetrievalConfig = z.infer<typeof DocsRetrievalConfigSchema>;

export const DocsVectorStoreConfigSchema = z.object({
  kind: VectorStoreKindSchema.default(DEFAULT_VECTOR_STORE_KIND),
  /** Reference (e.g. keyvault key) to the connection config for hosted stores. */
  configRef: z.string().optional(),
});
export type DocsVectorStoreConfig = z.infer<typeof DocsVectorStoreConfigSchema>;

export const DocsEmbeddingConfigSchema = z.object({
  model: z.string().min(1).default(DEFAULT_EMBEDDING_MODEL),
  dims: z.number().int().positive().default(DEFAULT_EMBEDDING_DIMS),
});
export type DocsEmbeddingConfig = z.infer<typeof DocsEmbeddingConfigSchema>;

export const DocsServingConfigSchema = z.object({
  /** Expose an MCP server with an NLWeb-style `ask`/`search` tool. */
  mcp: z.boolean().default(true),
  /** Expose a REST `/ask` endpoint returning `{ answer, citations[] }`. */
  rest: z.boolean().default(true),
});
export type DocsServingConfig = z.infer<typeof DocsServingConfigSchema>;

export const DocsManifestSchema = z.object({
  kind: z.literal("docs"),
  name: z.string().min(1).max(200),
  description: z.string().max(4000).optional(),
  publisher: z.string().max(200).optional(),
  version: z.string().max(64).optional(),
  sources: z.array(DocsSourceSchema).min(1),
  format: DocsFormatSchema.default("mixed"),
  retrieval: DocsRetrievalConfigSchema.default({
    strategy: "vector",
    topK: DEFAULT_RETRIEVAL_TOP_K,
  }),
  vectorStore: DocsVectorStoreConfigSchema.default({
    kind: DEFAULT_VECTOR_STORE_KIND,
  }),
  embedding: DocsEmbeddingConfigSchema.default({
    model: DEFAULT_EMBEDDING_MODEL,
    dims: DEFAULT_EMBEDDING_DIMS,
  }),
  serving: DocsServingConfigSchema.default({ mcp: true, rest: true }),
});
export type DocsManifest = z.infer<typeof DocsManifestSchema>;
