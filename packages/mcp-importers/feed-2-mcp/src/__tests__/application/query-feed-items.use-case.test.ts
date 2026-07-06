import { describe, it, expect, vi } from "vitest";
import { QueryFeedItemsUseCase } from "../../application/query-feed-items.use-case.js";
import type { StoreAdapter } from "../../store/adapter.js";

const FEED_URL = "https://example.com/feed.rss";

function makeItem(id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  // Simulate items as returned by the store: content hash as _id, _fetchedAt as metadata
  return {
    _id: "a".repeat(64), // simulate a SHA-256 hash
    _fetchedAt: "2024-06-01T01:00:00.000Z",
    title: "Test Article",
    link: "https://example.com/a",
    pubDate: "2024-06-01T00:00:00.000Z",
    description: "Summary",
    // Make each item unique by embedding id in a field
    description2: id,
    ...overrides,
  };
}

function makeMockStore(items: Record<string, unknown>[], feedExists = true): StoreAdapter {
  return {
    initFeed: vi.fn(),
    ingest: vi.fn(),
    recordRefreshAttempt: vi.fn(),
    updatePollingMeta: vi.fn(),
    getFeedInfo: vi.fn(),
    getItem: vi.fn(),
    getAllItems: vi.fn().mockResolvedValue(items),
    storeObservedSchema: vi.fn(),
    getObservedSchema: vi.fn().mockResolvedValue(null),
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
    const store = makeMockStore([makeItem("1")]);
    const useCase = new QueryFeedItemsUseCase(store, opts);
    const result = await useCase.execute(FEED_URL, {});
    expect("items" in result).toBe(true);
    const qr = result as import("../../types.js").QueryResult;
    expect(qr.items).toHaveLength(1);
    expect(qr.totalMatched).toBe(1);
  });

  it("passes filter to executor and returns matching items only", async () => {
    const items = [
      makeItem("a", { title: "OpenAI Article" }),
      makeItem("b", { title: "Sports Update" }),
    ];
    const store = makeMockStore(items);
    const useCase = new QueryFeedItemsUseCase(store, opts);
    const result = await useCase.execute(FEED_URL, { filter: "title=like=*OpenAI*" });
    const qr = result as import("../../types.js").QueryResult;
    expect(qr.items).toHaveLength(1);
  });

  it("returns ToolError for invalid query (top exceeds max)", async () => {
    const store = makeMockStore([makeItem("1")]);
    const useCase = new QueryFeedItemsUseCase(store, opts);
    const result = await useCase.execute(FEED_URL, { top: 9999 });
    expect("error" in result).toBe(true);
  });

  it("respects pagination parameters", async () => {
    const items = Array.from({ length: 10 }, (_, i) => makeItem(`item-${i}`));
    const store = makeMockStore(items);
    const useCase = new QueryFeedItemsUseCase(store, opts);
    const result = await useCase.execute(FEED_URL, { top: 3, skip: 2 });
    const qr = result as import("../../types.js").QueryResult;
    expect(qr.returned).toBe(3);
    expect(qr.skip).toBe(2);
  });
});
