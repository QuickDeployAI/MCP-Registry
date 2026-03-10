/**
 * Use case: refresh a feed from its source URL.
 */
import type { StoreAdapter } from "../store/adapter.js";
import type { ToolError } from "../types.js";
import type { FetcherFn, ParserFn, NormalizerFn } from "../polling/coordinator.js";
import { inspectSchema } from "../introspection/schema-inspector.js";

export interface RefreshResult {
  feedUrl: string;
  newItems: number;
  feedTitle: string | null;
  error?: string;
}

export class RefreshFeedUseCase {
  constructor(
    private readonly store: StoreAdapter,
    private readonly fetcher: FetcherFn,
    private readonly parser: ParserFn,
    private readonly normalizer: NormalizerFn,
  ) {}

  async execute(feedUrl: string): Promise<RefreshResult | ToolError> {
    try {
      const xml = await this.fetcher(feedUrl);
      const parsed = await this.parser(xml);
      const items = this.normalizer(parsed, feedUrl);

      if (!this.store.hasFeed(feedUrl)) {
        await this.store.initFeed(feedUrl, parsed.title ?? null);
      }

      const newItems = await this.store.ingest(feedUrl, items);
      await this.store.recordRefreshAttempt(feedUrl, {
        success: true,
        feedTitle: parsed.title,
        feedDescription: parsed.description,
      });

      // Derive and persist the observed schema from current native items.
      const nativeItems = await this.store.getAllNativeItems(feedUrl);
      const schema = inspectSchema(feedUrl, nativeItems);
      await this.store.storeObservedSchema(feedUrl, schema);

      return {
        feedUrl,
        newItems,
        feedTitle: parsed.title ?? null,
      };
    } catch (err) {
      const msg = (err as Error).message;
      if (this.store.hasFeed(feedUrl)) {
        await this.store.recordRefreshAttempt(feedUrl, { success: false, error: msg });
      }
      return {
        error: "Refresh failed",
        reason: msg,
        suggestion: "Check that the feed URL is valid and accessible.",
      };
    }
  }
}
