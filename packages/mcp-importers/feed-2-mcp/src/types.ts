/**
 * Core TypeScript types for the RSS-to-MCP server.
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
 * A raw feed entry as stored — the feedsmith item augmented with internal
 * metadata (`_id`, `_fetchedAt`) added at ingest time.
 * Key = field name, Value = raw field value.
 */
export type NativeItem = Record<string, unknown>;

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

/** A single query result record (arbitrary feed item fields). */
export type FeedItemRecord = Record<string, unknown>;

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
