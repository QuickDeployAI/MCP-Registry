/**
 * The feed URI is optional at startup; it may be provided per-tool-call
 * instead (or pre-loaded via --feed for convenience).
 */
import { defineConfig } from "@quickdeployai/importer-core";

export interface ServerConfig {
  /** Optional default feed URL or file path. When set, the server
   *  pre-loads this feed at startup and uses it as the default when
   *  a tool call omits the feedUrl parameter. */
  defaultFeed: string | null;
  /** Polling interval in milliseconds. 0 means polling is disabled (manual-only). */
  pollIntervalMs: number;
  /** Whether periodic polling is enabled. Defaults to false (manual refresh only). */
  pollingEnabled: boolean;
  /** Maximum feed items retained per feed */
  maxItems: number;
  /** Maximum number of items returned per query */
  maxQueryResults: number;
  /** Maximum character length for summary / text fields in query results */
  maxFieldSize: number;
  /** Storage backend to use */
  storageBackend: "memory" | "file" | "vector";
  /** Directory for file/vector storage */
  storagePath: string;
  /** Embedding provider for vector search */
  embeddingProvider: "none" | "openai";
  /** OpenAI API key (for embedding) */
  openaiApiKey: string | null;
}

const DEFAULT_POLL_INTERVAL_MS = 0;
const DEFAULT_MAX_ITEMS = 5000;
const DEFAULT_MAX_QUERY_RESULTS = 50;
const DEFAULT_MAX_FIELD_SIZE = 500;
const DEFAULT_STORAGE_BACKEND = "memory" as const;
const DEFAULT_STORAGE_PATH = "./rss2mcp-data";
const DEFAULT_EMBEDDING_PROVIDER = "none" as const;

const serverConfig = defineConfig({
  defaultFeed: {
    type: "string",
    cli: ["feed", "f"],
    env: ["RSS_FEED", "FEED"],
    default: null as string | null,
  },
  pollIntervalMs: {
    type: "number",
    cli: ["poll-interval", "i"],
    env: ["POLL_INTERVAL"],
    default: DEFAULT_POLL_INTERVAL_MS as number,
  },
  poll: {
    type: "boolean",
    cli: "poll",
    default: true as boolean,
  },
  noPoll: {
    type: "boolean",
    cli: "no-poll",
    env: ["NO_POLL"],
    default: false as boolean,
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
});

export function loadConfig(argv?: string[]): ServerConfig {
  const parsed = serverConfig.parse(argv);
  const storageBackend = parsed.storageBackend as "memory" | "file" | "vector";
  const embeddingProvider = parsed.embeddingProvider as "none" | "openai";
  const noPoll = parsed.poll === false || parsed.noPoll === true;

  return {
    defaultFeed: parsed.defaultFeed,
    pollIntervalMs: parsed.pollIntervalMs,
    pollingEnabled: !noPoll && parsed.pollIntervalMs > 0,
    maxItems: parsed.maxItems,
    maxQueryResults: parsed.maxQueryResults,
    maxFieldSize: parsed.maxFieldSize,
    storageBackend,
    storagePath: parsed.storagePath,
    embeddingProvider,
    openaiApiKey: parsed.openaiApiKey,
  };
}
