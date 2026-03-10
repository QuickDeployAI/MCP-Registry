/**
 * Use case: get feed metadata.
 */
import type { StoreAdapter } from "../store/adapter.js";
import type { FeedInfo, ToolError } from "../types.js";

export class GetFeedInfoUseCase {
  constructor(private readonly store: StoreAdapter) {}

  async execute(feedUrl: string): Promise<FeedInfo | ToolError> {
    const info = await this.store.getFeedInfo(feedUrl);
    if (!info) {
      return {
        error: "Feed not found",
        reason: `No data for feed: ${feedUrl}`,
        suggestion: "Call refresh_feed first to load the feed.",
      };
    }
    return info;
  }
}
