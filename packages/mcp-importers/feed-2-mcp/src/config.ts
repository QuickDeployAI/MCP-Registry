/**
 * Configuration loading.
 * Merges CLI arguments, environment variables, and defaults.
 *
 * The feed URI is optional at startup; it may be provided per-tool-call
 * instead (or pre-loaded via --feed for convenience).
 */
import { Command, InvalidArgumentError, Option } from "commander";

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
  /** Streamable HTTP server port */
  port: number;
  /** Streamable HTTP endpoint path */
  mcpPath: `/${string}`;
}

const DEFAULT_POLL_INTERVAL_MS = 0; // disabled by default (manual refresh only)
const DEFAULT_MAX_ITEMS = 5000;
const DEFAULT_MAX_QUERY_RESULTS = 50;
const DEFAULT_MAX_FIELD_SIZE = 500;
const DEFAULT_STORAGE_BACKEND = "memory" as const;
const DEFAULT_STORAGE_PATH = "./rss2mcp-data";
const DEFAULT_EMBEDDING_PROVIDER = "none" as const;
const DEFAULT_PORT = 3000;
const DEFAULT_MCP_PATH = "/mcp" as const;

function parseInteger(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    throw new InvalidArgumentError("Expected an integer.");
  }
  return parsed;
}

function normalizePath(value: string): `/${string}` {
  return value.startsWith("/") ? (value as `/${string}`) : `/${value}`;
}

export function loadConfig(argv?: string[]): ServerConfig {
  const program = new Command()
    .exitOverride()
    .name("feed-2-mcp")
    .description("Model Context Protocol server for RSS/Atom feed querying")
    .option("-f, --feed <url>", "Default feed URL or file path (optional)")
    .option(
      "-i, --poll-interval <ms>",
      "Polling interval in milliseconds. Omitting this (or setting 0) leaves the server in manual-refresh-only mode.",
      parseInteger,
    )
    .option("--no-poll", "Disable automatic polling even if poll-interval is set")
    .option("--max-items <n>", "Maximum feed items to retain per feed (default: 5000)", parseInteger)
    .option("--max-query-results <n>", "Maximum items returned per query (default: 50)", parseInteger)
    .option("--max-field-size <n>", "Maximum characters per field value in query results (default: 500)", parseInteger)
    .addOption(
      new Option("--storage <mode>", "Storage backend: memory | file | vector (default: memory)")
        .choices(["memory", "file", "vector"]),
    )
    .option("--storage-path <dir>", "Directory for file/vector storage (default: ./rss2mcp-data)")
    .addOption(
      new Option("--embedding <provider>", "Embedding provider: none | openai (default: none)")
        .choices(["none", "openai"]),
    )
    .option("--openai-api-key <key>", "OpenAI API key for embeddings (or set OPENAI_API_KEY env)")
    .option("--port <number>", "Streamable HTTP server port", parseInteger)
    .option("--mcp <path>", "Streamable HTTP endpoint path", DEFAULT_MCP_PATH);

  program.parse(argv ?? process.argv.slice(2), { from: "user" });
  const args = program.opts<{
    feed?: string;
    pollInterval?: number;
    poll?: boolean;
    maxItems?: number;
    maxQueryResults?: number;
    maxFieldSize?: number;
    storage?: "memory" | "file" | "vector";
    storagePath?: string;
    embedding?: "none" | "openai";
    openaiApiKey?: string;
    port?: number;
    mcp?: string;
  }>();

  const defaultFeed =
    args.feed ??
    process.env.RSS_FEED ??
    process.env.FEED ??
    null;

  // When user passes --no-poll, commander sets args.poll = false.
  const noPoll =
    args.poll === false ||
    process.env.NO_POLL === "true" ||
    process.env.NO_POLL === "1";

  const explicitInterval =
    args.pollInterval ??
    (process.env.POLL_INTERVAL
      ? parseInt(process.env.POLL_INTERVAL, 10)
      : undefined);

  const pollIntervalMs = explicitInterval ?? DEFAULT_POLL_INTERVAL_MS;
  const pollingEnabled = !noPoll && pollIntervalMs > 0;

  const storageBackend = (
    args.storage ??
    process.env.STORAGE_BACKEND ??
    DEFAULT_STORAGE_BACKEND
  ) as "memory" | "file" | "vector";

  const embeddingProvider = (
    args.embedding ??
    process.env.EMBEDDING_PROVIDER ??
    DEFAULT_EMBEDDING_PROVIDER
  ) as "none" | "openai";

  return {
    defaultFeed,
    pollIntervalMs,
    pollingEnabled,
    maxItems:
      args.maxItems ??
      (process.env.MAX_ITEMS ? parseInt(process.env.MAX_ITEMS, 10) : undefined) ??
      DEFAULT_MAX_ITEMS,
    maxQueryResults:
      args.maxQueryResults ??
      (process.env.MAX_QUERY_RESULTS ? parseInt(process.env.MAX_QUERY_RESULTS, 10) : undefined) ??
      DEFAULT_MAX_QUERY_RESULTS,
    maxFieldSize:
      args.maxFieldSize ??
      (process.env.MAX_FIELD_SIZE ? parseInt(process.env.MAX_FIELD_SIZE, 10) : undefined) ??
      DEFAULT_MAX_FIELD_SIZE,
    storageBackend,
    storagePath:
      args.storagePath ??
      process.env.STORAGE_PATH ??
      DEFAULT_STORAGE_PATH,
    embeddingProvider,
    openaiApiKey:
      args.openaiApiKey ??
      process.env.OPENAI_API_KEY ??
      null,
    port:
      args.port ??
      (process.env.PORT ? parseInt(process.env.PORT, 10) : undefined) ??
      DEFAULT_PORT,
    mcpPath: normalizePath(args.mcp ?? process.env.MCP_PATH ?? DEFAULT_MCP_PATH),
  };
}
