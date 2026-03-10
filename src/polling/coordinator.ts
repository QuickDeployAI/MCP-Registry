/**
 * Polling / refresh coordinator.
 *
 * Manages periodic polling and manual refresh for registered feeds.
 * Polling is disabled by default; it is activated only when
 * pollIntervalMs > 0 is explicitly configured.
 */
import type { StoreAdapter } from "../store/adapter.js";
import type { ParsedFeed } from "../ingestion/parser.js";
import type { FeedItem, NativeItem } from "../types.js";
import { inspectSchema } from "../introspection/schema-inspector.js";

export type FetcherFn = (url: string) => Promise<string>;
export type ParserFn = (xml: string) => Promise<ParsedFeed>;
export type NormalizerFn = (
  feed: ParsedFeed,
  sourceUrl: string,
) => Array<{ internal: FeedItem; native: NativeItem }>;

interface FeedRefreshState {
  timer: ReturnType<typeof setInterval> | null;
  refreshing: boolean;
}

export class PollingCoordinator {
  private feeds = new Map<string, FeedRefreshState>();

  constructor(
    private store: StoreAdapter,
    private fetcher: FetcherFn,
    private parser: ParserFn,
    private normalizer: NormalizerFn,
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

    if (state.refreshing) {
      return { newItems: 0, error: "Refresh already in progress" };
    }

    state.refreshing = true;
    try {
      const xml = await this.fetcher(feedUrl);
      const parsed = await this.parser(xml);
      const pairs = this.normalizer(parsed, feedUrl);

      if (!this.store.hasFeed(feedUrl)) {
        await this.store.initFeed(feedUrl, parsed.title ?? null);
      }

      const newItems = await this.store.ingest(feedUrl, pairs);
      await this.store.recordRefreshAttempt(feedUrl, {
        success: true,
        feedTitle: parsed.title,
        feedDescription: parsed.description,
      });

      await this.runSchemaInspection(feedUrl);

      return { newItems };
    } catch (err) {
      const msg = (err as Error).message;
      await this.store.recordRefreshAttempt(feedUrl, { success: false, error: msg });
      return { newItems: 0, error: msg };
    } finally {
      state.refreshing = false;
    }
  }

  /** Run schema inspection and persist the result. */
  private async runSchemaInspection(feedUrl: string): Promise<void> {
    try {
      const allNativeItems = await this.store.getAllNativeItems(feedUrl);
      const schema = inspectSchema(feedUrl, allNativeItems);
      await this.store.storeObservedSchema(feedUrl, schema);
    } catch {
      // Schema inspection is best-effort; don't fail the refresh
    }
  }

  /** Stop all timers (called on server shutdown). */
  shutdown(): void {
    for (const state of this.feeds.values()) {
      if (state.timer) clearInterval(state.timer);
    }
  }
}
