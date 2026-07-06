/**
 * In-memory store adapter (default backend).
 *
 * Generic over TItem — stores raw feedsmith items augmented with `_id` and
 * `_fetchedAt`. Does not survive server restarts; choose FileStore for
 * persistence.
 */
import { createHash } from "node:crypto";
import type { FeedInfo, NativeItem, ObservedFeedSchema } from "../types.js";
import type { RefreshOutcome, StoreAdapter, StoredItem } from "./adapter.js";

function contentHash(item: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(item)).digest("hex");
}

interface FeedState<TItem> {
  info: FeedInfo;
  /** Items ordered newest-first. */
  items: StoredItem<TItem>[];
  byId: Map<string, StoredItem<TItem>>;
  /** SHA-256 of the original item (before metadata added) — for dedup. */
  seenHashes: Set<string>;
  observedSchema: ObservedFeedSchema | null;
}

export class MemoryStore<TItem extends NativeItem = NativeItem> implements StoreAdapter<TItem> {
  private feeds = new Map<string, FeedState<TItem>>();

  constructor(private readonly maxItems: number) {}

  async initFeed(feedUrl: string, feedTitle: string | null): Promise<void> {
    if (!this.feeds.has(feedUrl)) {
      this.feeds.set(feedUrl, {
        info: {
          feedTitle,
          feedUrl,
          feedDescription: null,
          lastRefreshAttemptedAt: null,
          lastRefreshSucceededAt: null,
          lastRefreshError: null,
          itemCount: 0,
          newItemsOnLastRefresh: 0,
          pollingEnabled: false,
          pollIntervalMs: null,
        },
        items: [],
        byId: new Map(),
        seenHashes: new Set(),
        observedSchema: null,
      });
    }
  }

  async ingest(feedUrl: string, incoming: TItem[]): Promise<number> {
    const state = this.feeds.get(feedUrl);
    if (!state) throw new Error(`Feed not initialised: ${feedUrl}`);

    const fetchedAt = new Date().toISOString();
    let newCount = 0;

    for (const raw of incoming) {
      const hash = contentHash(raw);
      if (state.seenHashes.has(hash)) continue;

      const stored: StoredItem<TItem> = { ...raw, _id: hash, _fetchedAt: fetchedAt } as StoredItem<TItem>;
      state.seenHashes.add(hash);
      state.byId.set(hash, stored);
      state.items.push(stored);
      newCount++;
    }

    // Sort newest-ingested-first. _fetchedAt is always set to new Date().toISOString() (UTC
    // ISO-8601) so lexicographic string comparison is equivalent to date comparison.
    state.items.sort((a, b) => (b._fetchedAt as string).localeCompare(a._fetchedAt as string));

    if (state.items.length > this.maxItems) {
      const evicted = state.items.splice(this.maxItems);
      for (const item of evicted) {
        state.byId.delete(item._id);
        state.seenHashes.delete(item._id);
      }
    }

    state.info.itemCount = state.items.length;
    state.info.newItemsOnLastRefresh = newCount;
    return newCount;
  }

  async recordRefreshAttempt(feedUrl: string, outcome: RefreshOutcome): Promise<void> {
    const state = this.feeds.get(feedUrl);
    if (!state) return;
    const now = new Date().toISOString();
    state.info.lastRefreshAttemptedAt = now;
    if (outcome.success) {
      state.info.lastRefreshSucceededAt = now;
      state.info.lastRefreshError = null;
      if (outcome.feedTitle !== undefined) state.info.feedTitle = outcome.feedTitle ?? null;
      if (outcome.feedDescription !== undefined) state.info.feedDescription = outcome.feedDescription ?? null;
    } else {
      state.info.lastRefreshError = outcome.error ?? "Unknown error";
    }
  }

  async updatePollingMeta(
    feedUrl: string,
    pollingEnabled: boolean,
    pollIntervalMs: number | null,
  ): Promise<void> {
    const state = this.feeds.get(feedUrl);
    if (!state) return;
    state.info.pollingEnabled = pollingEnabled;
    state.info.pollIntervalMs = pollIntervalMs;
  }

  async getFeedInfo(feedUrl: string): Promise<FeedInfo | null> {
    return this.feeds.get(feedUrl)?.info ?? null;
  }

  async getItem(feedUrl: string, id: string): Promise<StoredItem<TItem> | null> {
    return this.feeds.get(feedUrl)?.byId.get(id) ?? null;
  }

  async getAllItems(feedUrl: string): Promise<StoredItem<TItem>[]> {
    return this.feeds.get(feedUrl)?.items ?? [];
  }

  hasFeed(feedUrl: string): boolean {
    return this.feeds.has(feedUrl);
  }

  async storeObservedSchema(feedUrl: string, schema: ObservedFeedSchema): Promise<void> {
    const state = this.feeds.get(feedUrl);
    if (!state) return;
    state.observedSchema = schema;
  }

  async getObservedSchema(feedUrl: string): Promise<ObservedFeedSchema | null> {
    return this.feeds.get(feedUrl)?.observedSchema ?? null;
  }

  async close(): Promise<void> {
    // nothing to release
  }

  /**
   * Restore pre-formed StoredItems (e.g. loaded from disk or vector DB) without
   * recomputing `_id` or `_fetchedAt`. Preserves original ingestion timestamps and
   * correctly seeds `seenHashes` so live refreshes after reload deduplicate properly.
   */
  async restoreItems(feedUrl: string, items: StoredItem<TItem>[]): Promise<void> {
    const state = this.feeds.get(feedUrl);
    if (!state) throw new Error(`Feed not initialised: ${feedUrl}`);

    for (const item of items) {
      if (state.seenHashes.has(item._id)) continue;
      state.seenHashes.add(item._id);
      state.byId.set(item._id, item);
      state.items.push(item);
    }

    state.items.sort((a, b) => (b._fetchedAt as string).localeCompare(a._fetchedAt as string));

    if (state.items.length > this.maxItems) {
      const evicted = state.items.splice(this.maxItems);
      for (const item of evicted) {
        state.byId.delete(item._id);
        state.seenHashes.delete(item._id);
      }
    }

    state.info.itemCount = state.items.length;
  }
}
