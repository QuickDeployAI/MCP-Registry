/**
 * Use case: query feed items with filter, search, sort, and pagination.
 */
import type { NativeItem, FeedQuery, QueryResult, ToolError } from "../types.js";
import type { StoreAdapter } from "../store/adapter.js";
import { executeQuery } from "../query/executor.js";

export interface QueryOptions {
  maxResults: number;
  maxFieldSize: number;
}

export class QueryFeedItemsUseCase<TItem extends NativeItem = NativeItem> {
  constructor(
    private readonly store: StoreAdapter<TItem>,
    private readonly opts: QueryOptions,
  ) {}

  async execute(feedUrl: string, query: FeedQuery): Promise<QueryResult | ToolError> {
    if (!this.store.hasFeed(feedUrl)) {
      return {
        error: "Feed not found",
        reason: `No data for feed: ${feedUrl}`,
        suggestion: "Call refresh_feed first to load the feed.",
      };
    }

    const items = await this.store.getAllItems(feedUrl);
    const result = executeQuery(items, query, {
      maxResults: this.opts.maxResults,
      maxFieldSize: this.opts.maxFieldSize,
    });

    if (result.errors) {
      return { error: "Invalid query", reason: result.errors.map((e) => `${e.field}: ${e.message}`).join("; ") };
    }

    return result.result!;
  }
}
