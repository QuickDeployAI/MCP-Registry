/**
 * Polling / refresh coordinator.
 *
 * Generic over TItem — the raw feedsmith item type stored in the backing
 * store. Manages periodic polling and manual refresh for registered feeds.
 */
import type { NativeItem } from "../types.js";
import type { StoreAdapter } from "../store/adapter.js";
import { parseFeed } from "feedsmith";
import { extractItems, extractFeedMeta, toSourceFormat } from "../ingestion/feed-utils.js";
import { inspectSchema } from "../introspection/schema-inspector.js";

export type FetcherFn = (url: string) => Promise<string>;
export type ParserFn = (source: string) => ReturnType<typeof parseFeed>;

interface FeedRefreshState {
  timer: ReturnType<typeof setInterval> | null;
  refreshing: boolean;
}

export class PollingCoordinator<TItem extends NativeItem = NativeItem> {
  private feeds = new Map<string, FeedRefreshState>();

  constructor(
    private store: StoreAdapter<TItem>,
    private fetcher: FetcherFn,
    private parser: ParserFn,
  ) {}

  /**
   * Register a feed for management.
   * If pollIntervalMs > 0, starts periodic polling immediately.
   */
  register(feedUrl: string, pollIntervalMs: number): void {
    if (this.feeds.has(feedUrl)) return;
    const state: FeedRefreshState = { timer: null, refreshing: false };
    this.feeds.set(feedUrl, state);

    if (pollIntervalMs > 0) {
      void this.refresh(feedUrl);
      state.timer = setInterval(() => void this.refresh(feedUrl), pollIntervalMs);
    }
  }

  /** Manually trigger a refresh and await the result. */
  async refresh(feedUrl: string): Promise<{ newItems: number; error?: string }> {
    let state = this.feeds.get(feedUrl);
    if (!state) {
      state = { timer: null, refreshing: false };
      this.feeds.set(feedUrl, state);
      await this.store.initFeed(feedUrl, null);
    }

    if (state.refreshing) return { newItems: 0, error: "Refresh already in progress" };

    state.refreshing = true;
    try {
      const source = await this.fetcher(feedUrl);
      const parsed = this.parser(source);
      const { title, description } = extractFeedMeta(parsed);
      const items = extractItems(parsed) as TItem[];

      if (!this.store.hasFeed(feedUrl)) {
        await this.store.initFeed(feedUrl, title ?? null);
      }

      const newItems = await this.store.ingest(feedUrl, items);
      await this.store.recordRefreshAttempt(feedUrl, { success: true, feedTitle: title, feedDescription: description });
      await this.runSchemaInspection(feedUrl, parsed.format);

      return { newItems };
    } catch (err) {
      const msg = (err as Error).message;
      await this.store.recordRefreshAttempt(feedUrl, { success: false, error: msg });
      return { newItems: 0, error: msg };
    } finally {
      state.refreshing = false;
    }
  }

  private async runSchemaInspection(feedUrl: string, format: ReturnType<typeof parseFeed>["format"]): Promise<void> {
    try {
      const allItems = await this.store.getAllItems(feedUrl);
      const schema = inspectSchema(feedUrl, allItems, toSourceFormat(format));
      await this.store.storeObservedSchema(feedUrl, schema);
    } catch {
      // Schema inspection is best-effort
    }
  }

  shutdown(): void {
    for (const state of this.feeds.values()) {
      if (state.timer) clearInterval(state.timer);
    }
  }
}
