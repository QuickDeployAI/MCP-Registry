/**
 * Abstract store adapter interface.
 *
 * All storage backends (memory, file, vector) implement this interface
 * so the rest of the server is decoupled from the storage mechanism.
 *
 * Internal note: FeedItem is private to the store layer; NativeItem is the
 * public representation exposed to LLMs via ObservedFeedSchema.
 */
import type { FeedItem, FeedInfo, NativeItem, ObservedFeedSchema } from "../types.js";

export interface RefreshOutcome {
  success: boolean;
  error?: string;
  feedTitle?: string | null;
  feedDescription?: string | null;
}

export interface IngestPair {
  internal: FeedItem;
  native: NativeItem;
}

export interface StoreAdapter {
  /** Ensure a feed slot exists; call before first ingest. */
  initFeed(feedUrl: string, feedTitle: string | null): Promise<void>;

  /**
   * Ingest normalised items, deduplicating against existing content.
   * Returns the count of truly new items added.
   */
  ingest(feedUrl: string, items: IngestPair[]): Promise<number>;

  /** Record the outcome of a refresh attempt. */
  recordRefreshAttempt(feedUrl: string, outcome: RefreshOutcome): Promise<void>;

  /** Update feed polling metadata. */
  updatePollingMeta(
    feedUrl: string,
    pollingEnabled: boolean,
    pollIntervalMs: number | null,
  ): Promise<void>;

  /** Return current feed metadata, or null if the feed is unknown. */
  getFeedInfo(feedUrl: string): Promise<FeedInfo | null>;

  /** Retrieve a single item by id. */
  getItem(feedUrl: string, id: string): Promise<FeedItem | null>;

  /**
   * Return all items for a feed, newest-first.
   * For the vector backend this returns all stored items (vector search
   * is handled separately via searchItems).
   */
  getAllItems(feedUrl: string): Promise<FeedItem[]>;

  /** True if this feed has been initialised in the store. */
  hasFeed(feedUrl: string): boolean;

  /** Store or update the observed schema for a feed. */
  storeObservedSchema(feedUrl: string, schema: ObservedFeedSchema): Promise<void>;

  /** Retrieve the observed schema for a feed, or null if not yet derived. */
  getObservedSchema(feedUrl: string): Promise<ObservedFeedSchema | null>;

  /** Retrieve the native representation of one item by id. */
  getNativeItem(feedUrl: string, id: string): Promise<NativeItem | null>;

  /** Return all native items, newest-first (same order as getAllItems). */
  getAllNativeItems(feedUrl: string): Promise<NativeItem[]>;

  /**
   * Optional semantic/vector search.
   * Returns items ranked by relevance to the natural-language query.
   * Falls back to undefined (caller uses keyword search) if the backend
   * does not support vector search.
   */
  searchItems?(
    feedUrl: string,
    query: string,
    topK: number,
  ): Promise<FeedItem[] | undefined>;

  /** Release resources (timers, file handles, DB connections). */
  close(): Promise<void>;
}
