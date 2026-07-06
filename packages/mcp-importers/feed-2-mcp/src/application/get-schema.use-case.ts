/**
 * Use case: return the observed, feed-specific schema derived from actual feed items.
 */
import type { StoreAdapter } from "../store/adapter.js";
import type { ObservedFeedSchema, ToolError } from "../types.js";

export class GetSchemaUseCase {
  constructor(private readonly store: StoreAdapter) {}

  async execute(feedUrl: string): Promise<ObservedFeedSchema | ToolError> {
    const schema = await this.store.getObservedSchema(feedUrl);
    if (!schema) {
      return {
        error: "Schema not available",
        reason: `No schema observed for feed: ${feedUrl}`,
        suggestion: "Call refresh_feed first to load and inspect the feed.",
      };
    }
    return schema;
  }
}
