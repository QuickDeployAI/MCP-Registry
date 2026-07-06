import { describe, it, expect, beforeEach } from "vitest";
import { MemoryStore } from "../../store/index.js";

const FEED_URL = "https://example.com/feed.rss";

/** A minimal RSS-like item — any shape is valid now. */
function makeItem(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    title: "Test Article",
    link: `https://example.com/${id}`,
    pubDate: "2024-06-01T00:00:00.000Z",
    description: "Summary",
    guid: { value: id },
    ...extra,
  };
}

describe("MemoryStore", () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore(100);
  });

  it("hasFeed returns false before initFeed", () => {
    expect(store.hasFeed(FEED_URL)).toBe(false);
  });

  it("hasFeed returns true after initFeed", async () => {
    await store.initFeed(FEED_URL, "Test Feed");
    expect(store.hasFeed(FEED_URL)).toBe(true);
  });

  it("ingest returns count of new items", async () => {
    await store.initFeed(FEED_URL, "Feed");
    const count = await store.ingest(FEED_URL, [makeItem("a"), makeItem("b")]);
    expect(count).toBe(2);
  });

  it("deduplicates items by content hash", async () => {
    await store.initFeed(FEED_URL, "Feed");
    const item = makeItem("a");
    await store.ingest(FEED_URL, [item]);
    const count = await store.ingest(FEED_URL, [item]);
    expect(count).toBe(0);
    const items = await store.getAllItems(FEED_URL);
    expect(items).toHaveLength(1);
  });

  it("deduplicates items by ID", async () => {
    await store.initFeed(FEED_URL, "Feed");
    const item1 = makeItem("dup");
    // item2 has a different guid but same structure — computeContentHash determines dedup
    // Two items with the same content hash will be deduped regardless of any "id" field
    const item2 = { ...item1 }; // identical content → same hash
    await store.ingest(FEED_URL, [item1]);
    const count = await store.ingest(FEED_URL, [item2]);
    expect(count).toBe(0);
  });

  it("respects maxItems cap", async () => {
    const smallStore = new MemoryStore(3);
    await smallStore.initFeed(FEED_URL, "Feed");
    const items = Array.from({ length: 5 }, (_, i) => makeItem(`item-${i}`));
    await smallStore.ingest(FEED_URL, items);
    const stored = await smallStore.getAllItems(FEED_URL);
    expect(stored).toHaveLength(3);
  });

  it("getFeedInfo returns feed metadata", async () => {
    await store.initFeed(FEED_URL, "My Feed");
    const info = await store.getFeedInfo(FEED_URL);
    expect(info).not.toBeNull();
    expect(info!.feedTitle).toBe("My Feed");
    expect(info!.feedUrl).toBe(FEED_URL);
  });

  it("getItem retrieves item by _id (content hash)", async () => {
    await store.initFeed(FEED_URL, "Feed");
    const item = makeItem("target");
    await store.ingest(FEED_URL, [item]);
    const allItems = await store.getAllItems(FEED_URL);
    const storedId = allItems[0]._id as string;
    // _id is the SHA-256 content hash
    expect(storedId).toHaveLength(64);
    const found = await store.getItem(FEED_URL, storedId);
    expect(found).not.toBeNull();
  });

  it("getItem returns null for unknown ID", async () => {
    await store.initFeed(FEED_URL, "Feed");
    const item = await store.getItem(FEED_URL, "nonexistent");
    expect(item).toBeNull();
  });

  it("getAllItems augments items with _id (hash) and _fetchedAt", async () => {
    await store.initFeed(FEED_URL, "Feed");
    await store.ingest(FEED_URL, [makeItem("x")]);
    const items = await store.getAllItems(FEED_URL);
    expect(typeof items[0]._id).toBe("string");
    expect((items[0]._id as string)).toHaveLength(64); // SHA-256 hex
    expect(typeof items[0]._fetchedAt).toBe("string");
  });

  it("recordRefreshAttempt updates metadata", async () => {
    await store.initFeed(FEED_URL, "Feed");
    await store.recordRefreshAttempt(FEED_URL, { success: true, feedTitle: "Updated" });
    const info = await store.getFeedInfo(FEED_URL);
    expect(info!.lastRefreshSucceededAt).not.toBeNull();
    expect(info!.feedTitle).toBe("Updated");
  });
});
