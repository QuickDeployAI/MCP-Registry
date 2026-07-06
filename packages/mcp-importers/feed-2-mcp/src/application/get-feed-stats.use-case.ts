/**
 * Use case: compute feed statistics.
 *
 * Returns only information available without assuming any item field structure:
 * - item count
 * - ingestion timestamp range (`_fetchedAt` metadata added by the store)
 */
import type { NativeItem, ToolError } from "../types.js";
import type { StoreAdapter } from "../store/adapter.js";

export interface FeedStats {
  feedUrl: string;
  itemCount: number;
  /** _fetchedAt of the oldest stored item (ISO-8601). */
  oldestItemFetchedAt: string | null;
  /** _fetchedAt of the newest stored item (ISO-8601). */
  newestItemFetchedAt: string | null;
}

export class GetFeedStatsUseCase<TItem extends NativeItem = NativeItem> {
  constructor(private readonly store: StoreAdapter<TItem>) {}

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
      return { feedUrl, itemCount: 0, oldestItemFetchedAt: null, newestItemFetchedAt: null };
    }

    const dates = items.map((i) => i._fetchedAt as string).sort();
    return {
      feedUrl,
      itemCount: items.length,
      oldestItemFetchedAt: dates[0] ?? null,
      newestItemFetchedAt: dates[dates.length - 1] ?? null,
    };
  }
}
