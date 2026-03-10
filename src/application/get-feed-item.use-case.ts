/**
 * Use case: retrieve a single feed item by ID, with optional sparse projection.
 * Large fields are returned as ContentRef objects instead of inline content.
 */
import type { StoreAdapter } from "../store/adapter.js";
import type { FeedItem, FeedItemRecord, ToolError } from "../types.js";
import type { ContentRef } from "../content/content-store.js";
import { ContentStore } from "../content/content-store.js";
import { LARGE_FIELDS, DEFAULT_SELECT } from "../schema.js";

export class GetFeedItemUseCase {
  constructor(
    private readonly store: StoreAdapter,
    private readonly contentStore: ContentStore,
  ) {}

  async execute(
    feedUrl: string,
    id: string,
    select?: string[],
  ): Promise<FeedItemRecord | ToolError> {
    const item = await this.store.getItem(feedUrl, id);
    if (!item) {
      return {
        error: "Item not found",
        reason: `No item with id=${id} in feed ${feedUrl}`,
      };
    }

    const fields = select ?? (DEFAULT_SELECT as string[]);
    return this.projectWithContentRefs(item, fields);
  }

  private async projectWithContentRefs(
    item: FeedItem,
    fields: string[],
  ): Promise<FeedItemRecord> {
    const record: Record<string, unknown> = {};

    for (const f of fields) {
      const key = f as keyof FeedItem;
      const val = item[key];

      if (LARGE_FIELDS.has(f) && typeof val === "string" && val.length > 0) {
        const ref: ContentRef = await this.contentStore.store(item.id, f, val);
        record[f] = ref;
      } else {
        record[f] = val;
      }
    }

    return record as FeedItemRecord;
  }
}
