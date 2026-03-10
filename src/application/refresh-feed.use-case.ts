/**
 * Use case: refresh a feed from its source URL.
 */
import type { NativeItem, ToolError } from "../types.js";
import type { StoreAdapter } from "../store/adapter.js";
import type { FetcherFn, ParserFn } from "../polling/coordinator.js";
import { extractFeedMeta, extractItems, toSourceFormat } from "../ingestion/feed-utils.js";
import { inspectSchema } from "../introspection/schema-inspector.js";

export interface RefreshResult {
  feedUrl: string;
  newItems: number;
  feedTitle: string | null;
  error?: string;
}

export class RefreshFeedUseCase<TItem extends NativeItem = NativeItem> {
  constructor(
    private readonly store: StoreAdapter<TItem>,
    private readonly fetcher: FetcherFn,
    private readonly parser: ParserFn,
  ) {}

  async execute(feedUrl: string): Promise<RefreshResult | ToolError> {
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

      const allItems = await this.store.getAllItems(feedUrl);
      const schema = inspectSchema(feedUrl, allItems, toSourceFormat(parsed.format));
      await this.store.storeObservedSchema(feedUrl, schema);

      return { feedUrl, newItems, feedTitle: title ?? null };
    } catch (err) {
      const msg = (err as Error).message;
      if (this.store.hasFeed(feedUrl)) {
        await this.store.recordRefreshAttempt(feedUrl, { success: false, error: msg });
      }
      return { error: "Refresh failed", reason: msg, suggestion: "Check that the feed URL is valid and accessible." };
    }
  }
}
