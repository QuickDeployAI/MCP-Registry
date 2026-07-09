import { defineConfig } from "@quickdeployai/importer-core";

export interface ServerConfig {
  /** Directory to ingest. Required to load a corpus at startup, but a
   *  running server can also be pointed at a corpus per-tool-call. */
  sourceDir: string | null;
  /** Which ingestion adapter to run over sourceDir. */
  sourceType: "markdown" | "openwiki";
  /** Logical id for the ingested corpus (defaults to sourceDir). */
  corpusId: string | null;
  /** Watch sourceDir for changes and re-ingest automatically. */
  watch: boolean;
  /** Debounce window for watch-triggered re-ingestion. */
  watchDebounceMs: number;
  maxItems: number;
  maxQueryResults: number;
  maxFieldSize: number;
  storageBackend: "memory" | "file" | "vector";
  storagePath: string;
  embeddingProvider: "none" | "openai";
  openaiApiKey: string | null;
  port: number;
  mcpPath: `/${string}`;
}

const DEFAULT_MAX_ITEMS = 20000;
const DEFAULT_MAX_QUERY_RESULTS = 20;
const DEFAULT_MAX_FIELD_SIZE = 800;
const DEFAULT_STORAGE_BACKEND = "memory" as const;
const DEFAULT_STORAGE_PATH = "./knowledge-2-mcp-data";
const DEFAULT_EMBEDDING_PROVIDER = "none" as const;
const DEFAULT_PORT = 3000;
const DEFAULT_MCP_PATH = "/mcp" as const;
const DEFAULT_WATCH_DEBOUNCE_MS = 500;

function normalizePath(value: string): `/${string}` {
  return value.startsWith("/") ? (value as `/${string}`) : `/${value}`;
}

const serverConfig = defineConfig({
  sourceDir: {
    type: "string",
    cli: ["source", "s"],
    env: ["KNOWLEDGE_SOURCE_DIR", "SOURCE_DIR"],
    default: null as string | null,
  },
  sourceType: {
    type: "string",
    cli: "source-type",
    env: ["KNOWLEDGE_SOURCE_TYPE"],
    default: "markdown" as "markdown" | "openwiki",
    choices: ["markdown", "openwiki"],
  },
  corpusId: {
    type: "string",
    cli: "corpus-id",
    env: ["KNOWLEDGE_CORPUS_ID"],
    default: null as string | null,
  },
  watch: {
    type: "boolean",
    cli: "watch",
    env: ["KNOWLEDGE_WATCH"],
    default: false as boolean,
  },
  watchDebounceMs: {
    type: "number",
    cli: "watch-debounce",
    default: DEFAULT_WATCH_DEBOUNCE_MS as number,
  },
  maxItems: {
    type: "number",
    cli: "max-items",
    env: ["MAX_ITEMS"],
    default: DEFAULT_MAX_ITEMS as number,
  },
  maxQueryResults: {
    type: "number",
    cli: "max-query-results",
    env: ["MAX_QUERY_RESULTS"],
    default: DEFAULT_MAX_QUERY_RESULTS as number,
  },
  maxFieldSize: {
    type: "number",
    cli: "max-field-size",
    env: ["MAX_FIELD_SIZE"],
    default: DEFAULT_MAX_FIELD_SIZE as number,
  },
  storageBackend: {
    type: "string",
    cli: "storage",
    env: ["STORAGE_BACKEND"],
    default: DEFAULT_STORAGE_BACKEND as "memory" | "file" | "vector",
    choices: ["memory", "file", "vector"],
  },
  storagePath: {
    type: "string",
    cli: "storage-path",
    env: ["STORAGE_PATH"],
    default: DEFAULT_STORAGE_PATH as string,
  },
  embeddingProvider: {
    type: "string",
    cli: "embedding",
    env: ["EMBEDDING_PROVIDER"],
    default: DEFAULT_EMBEDDING_PROVIDER as "none" | "openai",
    choices: ["none", "openai"],
  },
  openaiApiKey: {
    type: "string",
    cli: "openai-api-key",
    env: ["OPENAI_API_KEY"],
    default: null as string | null,
  },
  port: {
    type: "number",
    cli: "port",
    env: ["PORT"],
    default: DEFAULT_PORT as number,
  },
  mcpPath: {
    type: "string",
    cli: "mcp",
    env: ["MCP_PATH"],
    default: DEFAULT_MCP_PATH as string,
  },
});

export function loadConfig(argv?: string[]): ServerConfig {
  const parsed = serverConfig.parse(argv);
  const storageBackend = parsed.storageBackend as "memory" | "file" | "vector";
  const embeddingProvider = parsed.embeddingProvider as "none" | "openai";
  const sourceType = parsed.sourceType as "markdown" | "openwiki";

  return {
    sourceDir: parsed.sourceDir,
    sourceType,
    corpusId: parsed.corpusId ?? parsed.sourceDir,
    watch: parsed.watch,
    watchDebounceMs: parsed.watchDebounceMs,
    maxItems: parsed.maxItems,
    maxQueryResults: parsed.maxQueryResults,
    maxFieldSize: parsed.maxFieldSize,
    storageBackend,
    storagePath: parsed.storagePath,
    embeddingProvider,
    openaiApiKey: parsed.openaiApiKey,
    port: parsed.port,
    mcpPath: normalizePath(parsed.mcpPath),
  };
}
