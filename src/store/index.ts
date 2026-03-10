/**
 * In-memory store adapter (default backend).
 *
 * All data lives in process memory. Fast, zero-config, but does not
 * survive server restarts.  Choose file-store or vector-store for
 * persistence across restarts.
 */
import type { FeedItem, FeedInfo, NativeItem, ObservedFeedSchema } from "../types.js";
import type { RefreshOutcome, StoreAdapter, IngestPair } from "./adapter.js";

interface FeedState {
  info: FeedInfo;
  /** Items ordered newest-first. */
  items: FeedItem[];
  byId: Map<string, FeedItem>;
  byHash: Map<string, FeedItem>;
  /** Native items keyed by internal item id. */
  nativeItems: Map<string, NativeItem>;
  /** Observed schema, set after schema inspection. */
  observedSchema: ObservedFeedSchema | null;
}

export class MemoryStore implements StoreAdapter {
  private feeds = new Map<string, FeedState>();

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
        byHash: new Map(),
        nativeItems: new Map(),
        observedSchema: null,
      });
    }
  }

  async ingest(feedUrl: string, incoming: IngestPair[]): Promise<number> {
    const state = this.feeds.get(feedUrl);
    if (!state) throw new Error(`Feed not initialised: ${feedUrl}`);

    let newCount = 0;
    for (const { internal, native } of incoming) {
      if (state.byHash.has(internal.contentHash) || state.byId.has(internal.id)) {
        continue;
      }
      state.byId.set(internal.id, internal);
      state.byHash.set(internal.contentHash, internal);
      state.items.push(internal);
      state.nativeItems.set(internal.id, native);
      newCount++;
    }

    state.items.sort((a, b) => {
      const ta = a.publishedAt ?? a.fetchedAt;
      const tb = b.publishedAt ?? b.fetchedAt;
      return tb.localeCompare(ta);
    });

    if (state.items.length > this.maxItems) {
      const evicted = state.items.splice(this.maxItems);
      for (const item of evicted) {
        state.byId.delete(item.id);
        state.byHash.delete(item.contentHash);
        state.nativeItems.delete(item.id);
      }
    }

    state.info.itemCount = state.items.length;
    state.info.newItemsOnLastRefresh = newCount;
    return newCount;
  }

  async recordRefreshAttempt(
    feedUrl: string,
    outcome: RefreshOutcome,
  ): Promise<void> {
    const state = this.feeds.get(feedUrl);
    if (!state) return;
    const now = new Date().toISOString();
    state.info.lastRefreshAttemptedAt = now;
    if (outcome.success) {
      state.info.lastRefreshSucceededAt = now;
      state.info.lastRefreshError = null;
      if (outcome.feedTitle !== undefined)
        state.info.feedTitle = outcome.feedTitle ?? null;
      if (outcome.feedDescription !== undefined)
        state.info.feedDescription = outcome.feedDescription ?? null;
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

  async getItem(feedUrl: string, id: string): Promise<FeedItem | null> {
    return this.feeds.get(feedUrl)?.byId.get(id) ?? null;
  }

  async getAllItems(feedUrl: string): Promise<FeedItem[]> {
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

  async getNativeItem(feedUrl: string, id: string): Promise<NativeItem | null> {
    return this.feeds.get(feedUrl)?.nativeItems.get(id) ?? null;
  }

  async getAllNativeItems(feedUrl: string): Promise<NativeItem[]> {
    const state = this.feeds.get(feedUrl);
    if (!state) return [];
    // Return in same order as items (newest-first)
    return state.items.map((item) => state.nativeItems.get(item.id) ?? {});
  }

  async close(): Promise<void> {
    // nothing to release
  }
}
