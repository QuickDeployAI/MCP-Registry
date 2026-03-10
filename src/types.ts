/**
 * Core TypeScript types for the RSS-to-MCP server.
 * These interfaces define the canonical data model.
 */

/**
 * A single field as observed in the actual feed items.
 * This is the PUBLIC schema contract exposed to LLMs.
 */
export interface ObservedFieldSchema {
  /** Native field name as it appears in the feed (e.g. "pubDate", "dc:creator"). */
  name: string;
  /** Inferred value type. */
  type: "string" | "datetime" | "boolean" | "number" | "string[]" | "object";
  /** Fraction of items (0.0–1.0) that have this field. */
  presence: number;
  selectable: boolean;
  filterable: boolean;
  searchable: boolean;
  sortable: boolean;
  /** True if average value length > 500 chars. Never returned inline by default. */
  large: boolean;
  /** A representative example value (truncated to 120 chars). */
  example: string | null;
  /** Canonical alias in the internal model, if one exists (e.g. "publishedAt"). */
  alias: string | null;
  /** Operators valid for this field in filter expressions. */
  allowedOperators: string[];
}

/**
 * The complete observed schema for one feed.
 * This is what get_schema(feedUrl) returns.
 */
export interface ObservedFeedSchema {
  feedUrl: string;
  sourceFormat: "rss2" | "atom" | "rss1" | "jsonfeed" | "unknown";
  observedAt: string;
  itemCount: number;
  fields: ObservedFieldSchema[];
}

/**
 * A native feed entry: the raw parsed fields as they appear in the feed.
 * This is what query_items returns in item records.
 * Key = native field name, Value = raw field value.
 */
export type NativeItem = Record<string, unknown>;

/** Normalized representation of a single feed item. */
export interface FeedItem {
  /** Unique internal identifier (stable hash of guid/link/title). */
  id: string;
  /** Human-readable name of the feed source. */
  sourceName: string;
  /** URL or path of the configured feed source. */
  sourceUrl: string;
  /** Article title. */
  title: string;
  /** Canonical link to the article. */
  link: string;
  /** Author name, if provided. */
  author: string | null;
  /** Publication date (ISO-8601). */
  publishedAt: string | null;
  /** Last-updated date (ISO-8601). */
  updatedAt: string | null;
  /** Short summary / excerpt (kept under maxFieldSize by default). */
  summary: string | null;
  /** Plain-text body (large field – not returned by default). */
  contentText: string | null;
  /** Raw HTML body (large field – not returned by default). */
  contentHtml: string | null;
  /** Categories / tags. */
  categories: string[];
  /** Language tag, e.g. "en". */
  language: string | null;
  /** Original guid from the feed. */
  guid: string | null;
  /** Timestamp when this item was first ingested (ISO-8601). */
  fetchedAt: string;
  /** SHA-256 content hash used for deduplication. */
  contentHash: string;
  /** True if contentText or contentHtml is available. */
  hasFullContent: boolean;
}

/** Field-level metadata exposed via get_schema. */
export interface FieldMeta {
  name: string;
  type: "string" | "datetime" | "boolean" | "string[]";
  selectable: boolean;
  filterable: boolean;
  searchable: boolean;
  sortable: boolean;
  large: boolean;
  allowedOperators?: string[];
  description: string;
}

/** Feed-level metadata and server state. */
export interface FeedInfo {
  feedTitle: string | null;
  feedUrl: string;
  feedDescription: string | null;
  lastRefreshAttemptedAt: string | null;
  lastRefreshSucceededAt: string | null;
  lastRefreshError: string | null;
  itemCount: number;
  newItemsOnLastRefresh: number;
  pollingEnabled: boolean;
  pollIntervalMs: number | null;
}

/** Structured query input accepted by query_feed_items. */
export interface FeedQuery {
  /** Fields to return. Defaults to compact summary set. */
  select?: string[];
  /** Filter expression (RSQL syntax). */
  filter?: string;
  /** Full-text search expression. */
  search?: string;
  /** Sort fields, e.g. ["publishedAt desc", "title asc"]. */
  orderBy?: string[];
  /** Maximum number of results to return. */
  top?: number;
  /** Number of results to skip (for paging). */
  skip?: number;
}

/** A single query result record (sparse – only requested fields). */
export type FeedItemRecord = Partial<FeedItem>;

/** Full structured query response. */
export interface QueryResult {
  items: FeedItemRecord[];
  totalMatched: number;
  returned: number;
  skip: number;
  top: number;
}

/** Structured error returned from tools. */
export interface ToolError {
  error: string;
  reason: string;
  suggestion?: string;
}
