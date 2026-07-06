/**
 * Abstract store adapter interface.
 *
 * Generic over TItem — the raw feedsmith item type (e.g. Rss.Item<string>).
 * Items stored by the store are TItem augmented with `_id` and `_fetchedAt`
 * metadata added at ingest time.
 */
import type { FeedInfo, NativeItem, ObservedFeedSchema } from "../types.js";

export type StoredItem<TItem> = TItem & { _id: string; _fetchedAt: string };

export interface RefreshOutcome {
  success: boolean;
  error?: string;
  feedTitle?: string | null;
  feedDescription?: string | null;
}

export interface StoreAdapter<TItem extends NativeItem = NativeItem> {
  /** Ensure a feed slot exists; call before first ingest. */
  initFeed(feedUrl: string, feedTitle: string | null): Promise<void>;

  /**
   * Ingest raw feedsmith items, deduplicating by content hash.
   * Adds `_id` and `_fetchedAt` to each item before storage.
   * Returns the count of truly new items added.
   */
  ingest(feedUrl: string, items: TItem[]): Promise<number>;

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

  /** Retrieve a single item by its `_id`. */
  getItem(feedUrl: string, id: string): Promise<StoredItem<TItem> | null>;

  /** Return all items for a feed, newest-first. */
  getAllItems(feedUrl: string): Promise<StoredItem<TItem>[]>;

  /** True if this feed has been initialised in the store. */
  hasFeed(feedUrl: string): boolean;

  /** Store or update the observed schema for a feed. */
  storeObservedSchema(feedUrl: string, schema: ObservedFeedSchema): Promise<void>;

  /** Retrieve the observed schema for a feed, or null if not yet derived. */
  getObservedSchema(feedUrl: string): Promise<ObservedFeedSchema | null>;

  /**
   * Optional semantic/vector search.
   * Returns items ranked by relevance to the query.
   * Returns undefined if the backend does not support vector search.
   */
  searchItems?(
    feedUrl: string,
    query: string,
    topK: number,
  ): Promise<StoredItem<TItem>[] | undefined>;

  /** Release resources (timers, file handles, DB connections). */
  close(): Promise<void>;
}
