/**
 * Use case: compute feed statistics.
 */
import type { StoreAdapter } from "../store/adapter.js";
import type { ToolError } from "../types.js";

export interface FeedStats {
  feedUrl: string;
  itemCount: number;
  oldestItem: string | null;
  newestItem: string | null;
  authorsCount: number;
  categoriesCount: number;
  hasFullContentCount: number;
}

export class GetFeedStatsUseCase {
  constructor(private readonly store: StoreAdapter) {}

  async execute(feedUrl: string): Promise<FeedStats | ToolError> {
    if (!this.store.hasFeed(feedUrl)) {
      return {
        error: "Feed not found",
        reason: `No data for feed: ${feedUrl}`,
        suggestion: "Call refresh_feed first to load the feed.",
      };
    }

    const items = await this.store.getAllItems(feedUrl);
    if (items.length === 0) {
      return this.emptyStats(feedUrl);
    }

    const dates = items
      .map((i) => i.publishedAt ?? i.fetchedAt)
      .filter(Boolean)
      .sort();

    const authors = new Set(items.map((i) => i.author).filter(Boolean));
    const categories = new Set(items.flatMap((i) => i.categories));
    const hasFullContentCount = items.filter((i) => i.hasFullContent).length;

    return {
      feedUrl,
      itemCount: items.length,
      oldestItem: dates[0] ?? null,
      newestItem: dates[dates.length - 1] ?? null,
      authorsCount: authors.size,
      categoriesCount: categories.size,
      hasFullContentCount,
    };
  }

  private emptyStats(feedUrl: string): FeedStats {
    return {
      feedUrl,
      itemCount: 0,
      oldestItem: null,
      newestItem: null,
      authorsCount: 0,
      categoriesCount: 0,
      hasFullContentCount: 0,
    };
  }
}
