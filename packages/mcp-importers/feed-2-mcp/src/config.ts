/**
 * Configuration loading.
 * Merges CLI arguments, environment variables, and defaults.
 *
 * The feed URI is optional at startup; it may be provided per-tool-call
 * instead (or pre-loaded via --feed for convenience).
 */
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

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

const DEFAULT_POLL_INTERVAL_MS = 0; // disabled by default (manual refresh only)
const DEFAULT_MAX_ITEMS = 5000;
const DEFAULT_MAX_QUERY_RESULTS = 50;
const DEFAULT_MAX_FIELD_SIZE = 500;
const DEFAULT_STORAGE_BACKEND = "memory" as const;
const DEFAULT_STORAGE_PATH = "./rss2mcp-data";
const DEFAULT_EMBEDDING_PROVIDER = "none" as const;

export function loadConfig(argv?: string[]): ServerConfig {
  const args = yargs(argv ?? hideBin(process.argv))
    .option("feed", {
      type: "string",
      description: "Default feed URL or file path (optional)",
      alias: "f",
    })
    .option("poll-interval", {
      type: "number",
      description: "Polling interval in milliseconds. Omitting this (or setting 0) leaves the server in manual-refresh-only mode.",
      alias: "i",
    })
    .option("poll", {
      type: "boolean",
      description: "Enable automatic polling (use --no-poll to disable, default: enabled when poll-interval > 0)",
      default: true,
    })
    .option("max-items", {
      type: "number",
      description: "Maximum feed items to retain per feed (default: 5000)",
    })
    .option("max-query-results", {
      type: "number",
      description: "Maximum items returned per query (default: 50)",
    })
    .option("max-field-size", {
      type: "number",
      description: "Maximum characters per field value in query results (default: 500)",
    })
    .option("storage", {
      type: "string",
      description: "Storage backend: memory | file | vector (default: memory)",
      choices: ["memory", "file", "vector"] as const,
    })
    .option("storage-path", {
      type: "string",
      description: "Directory for file/vector storage (default: ./rss2mcp-data)",
    })
    .option("embedding", {
      type: "string",
      description: "Embedding provider: none | openai (default: none)",
      choices: ["none", "openai"] as const,
    })
    .option("openai-api-key", {
      type: "string",
      description: "OpenAI API key for embeddings (or set OPENAI_API_KEY env)",
    })
    .help()
    .parseSync();

  const defaultFeed =
    (args.feed as string | undefined) ??
    process.env.RSS_FEED ??
    process.env.FEED ??
    null;

  // When user passes --no-poll, yargs sets args.poll = false
  const noPoll =
    args.poll === false ||
    process.env.NO_POLL === "true" ||
    process.env.NO_POLL === "1";

  const explicitInterval =
    (args["poll-interval"] as number | undefined) ??
    (process.env.POLL_INTERVAL
      ? parseInt(process.env.POLL_INTERVAL, 10)
      : undefined);

  const pollIntervalMs = explicitInterval ?? DEFAULT_POLL_INTERVAL_MS;
  const pollingEnabled = !noPoll && pollIntervalMs > 0;

  const storageBackend = (
    (args["storage"] as string | undefined) ??
    process.env.STORAGE_BACKEND ??
    DEFAULT_STORAGE_BACKEND
  ) as "memory" | "file" | "vector";

  const embeddingProvider = (
    (args["embedding"] as string | undefined) ??
    process.env.EMBEDDING_PROVIDER ??
    DEFAULT_EMBEDDING_PROVIDER
  ) as "none" | "openai";

  return {
    defaultFeed,
    pollIntervalMs,
    pollingEnabled,
    maxItems:
      (args["max-items"] as number | undefined) ??
      (process.env.MAX_ITEMS ? parseInt(process.env.MAX_ITEMS, 10) : undefined) ??
      DEFAULT_MAX_ITEMS,
    maxQueryResults:
      (args["max-query-results"] as number | undefined) ??
      (process.env.MAX_QUERY_RESULTS ? parseInt(process.env.MAX_QUERY_RESULTS, 10) : undefined) ??
      DEFAULT_MAX_QUERY_RESULTS,
    maxFieldSize:
      (args["max-field-size"] as number | undefined) ??
      (process.env.MAX_FIELD_SIZE ? parseInt(process.env.MAX_FIELD_SIZE, 10) : undefined) ??
      DEFAULT_MAX_FIELD_SIZE,
    storageBackend,
    storagePath:
      (args["storage-path"] as string | undefined) ??
      process.env.STORAGE_PATH ??
      DEFAULT_STORAGE_PATH,
    embeddingProvider,
    openaiApiKey:
      (args["openai-api-key"] as string | undefined) ??
      process.env.OPENAI_API_KEY ??
      null,
  };
}
