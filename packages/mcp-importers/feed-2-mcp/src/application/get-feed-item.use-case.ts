/**
 * Use case: retrieve a single feed item by its `_id`.
 * Large string fields (> LARGE_FIELD_THRESHOLD) are returned as ContentRef objects.
 */
import type { NativeItem, FeedItemRecord, ToolError } from "../types.js";
import type { StoreAdapter } from "../store/adapter.js";
import type { ContentRef } from "../content/content-store.js";
import { ContentStore } from "../content/content-store.js";
import { LARGE_FIELD_THRESHOLD } from "../schema.js";

export class GetFeedItemUseCase<TItem extends NativeItem = NativeItem> {
  constructor(
    private readonly store: StoreAdapter<TItem>,
    private readonly contentStore: ContentStore,
  ) {}

  async execute(
    feedUrl: string,
    id: string,
    select?: string[],
  ): Promise<FeedItemRecord | ToolError> {
    const item = await this.store.getItem(feedUrl, id);
    if (!item) {
      return { error: "Item not found", reason: `No item with id=${id} in feed ${feedUrl}` };
    }

    const fields = select ?? Object.keys(item);
    return this.projectWithContentRefs(item as Record<string, unknown>, id, fields);
  }

  private async projectWithContentRefs(
    item: Record<string, unknown>,
    id: string,
    fields: string[],
  ): Promise<FeedItemRecord> {
    const record: Record<string, unknown> = {};
    for (const f of fields) {
      const val = item[f];
      if (typeof val === "string" && val.length > LARGE_FIELD_THRESHOLD) {
        const ref: ContentRef = await this.contentStore.store(id, f, val);
        record[f] = ref;
      } else {
        record[f] = val;
      }
    }
    return record;
  }
}
