import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryFeedItemsUseCase } from "../../application/query-feed-items.use-case.js";
import type { StoreAdapter } from "../../store/adapter.js";
import type { FeedItem } from "../../types.js";

const FEED_URL = "https://example.com/feed.rss";

function makeItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    id: "item-1",
    sourceName: "Feed",
    sourceUrl: FEED_URL,
    title: "Test Article",
    link: "https://example.com/a",
    author: "Author",
    publishedAt: "2024-06-01T00:00:00.000Z",
    updatedAt: null,
    summary: "Summary",
    contentText: null,
    contentHtml: null,
    categories: [],
    language: "en",
    guid: "g1",
    fetchedAt: "2024-06-01T01:00:00.000Z",
    contentHash: "h1",
    hasFullContent: false,
    ...overrides,
  };
}

function makeMockStore(items: FeedItem[], feedExists = true): StoreAdapter {
  return {
    initFeed: vi.fn(),
    ingest: vi.fn(),
    recordRefreshAttempt: vi.fn(),
    updatePollingMeta: vi.fn(),
    getFeedInfo: vi.fn(),
    getItem: vi.fn(),
    getAllItems: vi.fn().mockResolvedValue(items),
    getAllNativeItems: vi.fn().mockResolvedValue(items.map(() => ({}))),
    storeObservedSchema: vi.fn(),
    getObservedSchema: vi.fn().mockResolvedValue(null),
    getNativeItem: vi.fn().mockResolvedValue(null),
    hasFeed: vi.fn().mockReturnValue(feedExists),
    close: vi.fn(),
  };
}

describe("QueryFeedItemsUseCase", () => {
  const opts = { maxResults: 50, maxFieldSize: 500 };

  it("returns ToolError when feed does not exist", async () => {
    const store = makeMockStore([], false);
    const useCase = new QueryFeedItemsUseCase(store, opts);
    const result = await useCase.execute(FEED_URL, {});
    expect("error" in result).toBe(true);
    expect((result as { error: string }).error).toBe("Feed not found");
  });

  it("returns QueryResult when feed exists", async () => {
    const store = makeMockStore([makeItem()]);
    const useCase = new QueryFeedItemsUseCase(store, opts);
    const result = await useCase.execute(FEED_URL, {});
    expect("items" in result).toBe(true);
    const qr = result as import("../../types.js").QueryResult;
    expect(qr.items).toHaveLength(1);
    expect(qr.totalMatched).toBe(1);
  });

  it("passes filter to executor and returns matching items only", async () => {
    const items = [
      makeItem({ id: "a", title: "OpenAI Article" }),
      makeItem({ id: "b", title: "Sports Update", contentHash: "h2" }),
    ];
    const store = makeMockStore(items);
    const useCase = new QueryFeedItemsUseCase(store, opts);
    const result = await useCase.execute(FEED_URL, { filter: "title=like=*OpenAI*" });
    const qr = result as import("../../types.js").QueryResult;
    expect(qr.items).toHaveLength(1);
  });

  it("returns ToolError for invalid query (top exceeds max)", async () => {
    const store = makeMockStore([makeItem()]);
    const useCase = new QueryFeedItemsUseCase(store, opts);
    const result = await useCase.execute(FEED_URL, { top: 9999 });
    expect("error" in result).toBe(true);
  });

  it("respects pagination parameters", async () => {
    const items = Array.from({ length: 10 }, (_, i) =>
      makeItem({ id: `item-${i}`, contentHash: `h${i}` }),
    );
    const store = makeMockStore(items);
    const useCase = new QueryFeedItemsUseCase(store, opts);
    const result = await useCase.execute(FEED_URL, { top: 3, skip: 2 });
    const qr = result as import("../../types.js").QueryResult;
    expect(qr.returned).toBe(3);
    expect(qr.skip).toBe(2);
  });
});
