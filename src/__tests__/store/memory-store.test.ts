import { describe, it, expect, beforeEach } from "vitest";
import { MemoryStore } from "../../store/index.js";
import type { FeedItem } from "../../types.js";
import type { IngestPair } from "../../store/adapter.js";

const FEED_URL = "https://example.com/feed.rss";

function makeItem(overrides: Partial<FeedItem> = {}): FeedItem {
  const id = overrides.id ?? "item-1";
  return {
    id,
    sourceName: "Test Feed",
    sourceUrl: FEED_URL,
    title: "Test Article",
    link: `https://example.com/${id}`,
    author: "Author",
    publishedAt: "2024-06-01T00:00:00.000Z",
    updatedAt: null,
    summary: "Summary",
    contentText: null,
    contentHtml: null,
    categories: [],
    language: "en",
    guid: id,
    fetchedAt: new Date().toISOString(),
    contentHash: `hash-${id}`,
    hasFullContent: false,
    ...overrides,
  };
}

function makePair(overrides: Partial<FeedItem> = {}): IngestPair {
  return { internal: makeItem(overrides), native: {} };
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
    const count = await store.ingest(FEED_URL, [makePair({ id: "a" }), makePair({ id: "b" })]);
    expect(count).toBe(2);
  });

  it("deduplicates items by contentHash", async () => {
    await store.initFeed(FEED_URL, "Feed");
    const pair = makePair({ id: "a", contentHash: "same-hash" });
    await store.ingest(FEED_URL, [pair]);
    const count = await store.ingest(FEED_URL, [pair]);
    expect(count).toBe(0);
    const items = await store.getAllItems(FEED_URL);
    expect(items).toHaveLength(1);
  });

  it("deduplicates items by ID", async () => {
    await store.initFeed(FEED_URL, "Feed");
    const pair1 = makePair({ id: "dup", contentHash: "h1" });
    const pair2 = makePair({ id: "dup", contentHash: "h2" });
    await store.ingest(FEED_URL, [pair1]);
    const count = await store.ingest(FEED_URL, [pair2]);
    expect(count).toBe(0);
  });

  it("respects maxItems cap", async () => {
    const smallStore = new MemoryStore(3);
    await smallStore.initFeed(FEED_URL, "Feed");
    const pairs = Array.from({ length: 5 }, (_, i) =>
      makePair({ id: `item-${i}`, contentHash: `h${i}` }),
    );
    await smallStore.ingest(FEED_URL, pairs);
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

  it("getItem retrieves item by ID", async () => {
    await store.initFeed(FEED_URL, "Feed");
    await store.ingest(FEED_URL, [makePair({ id: "target" })]);
    const item = await store.getItem(FEED_URL, "target");
    expect(item).not.toBeNull();
    expect(item!.id).toBe("target");
  });

  it("getItem returns null for unknown ID", async () => {
    await store.initFeed(FEED_URL, "Feed");
    const item = await store.getItem(FEED_URL, "nonexistent");
    expect(item).toBeNull();
  });

  it("recordRefreshAttempt updates metadata", async () => {
    await store.initFeed(FEED_URL, "Feed");
    await store.recordRefreshAttempt(FEED_URL, { success: true, feedTitle: "Updated" });
    const info = await store.getFeedInfo(FEED_URL);
    expect(info!.lastRefreshSucceededAt).not.toBeNull();
    expect(info!.feedTitle).toBe("Updated");
  });
});
