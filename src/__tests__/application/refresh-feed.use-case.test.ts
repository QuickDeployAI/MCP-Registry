import { describe, it, expect, vi, beforeEach } from "vitest";
import { RefreshFeedUseCase } from "../../application/refresh-feed.use-case.js";
import type { StoreAdapter } from "../../store/adapter.js";
import type { FeedItem, NativeItem } from "../../types.js";
import type { ParsedFeed } from "../../ingestion/parser.js";

const FEED_URL = "https://example.com/feed.rss";

const SAMPLE_XML = `<rss><channel><title>Test</title></channel></rss>`;

const PARSED_FEED: ParsedFeed = {
  title: "Test Feed",
  feedUrl: FEED_URL,
  description: "A test feed",
  language: "en",
  items: [
    {
      guid: "item-1",
      title: "Article 1",
      link: "https://example.com/1",
      isoDate: "2024-06-01T00:00:00.000Z",
      rawFields: { guid: "item-1", title: "Article 1" },
    },
    {
      guid: "item-2",
      title: "Article 2",
      link: "https://example.com/2",
      isoDate: "2024-06-02T00:00:00.000Z",
      rawFields: { guid: "item-2", title: "Article 2" },
    },
  ],
};

function makeNormalizedPairs(): Array<{ internal: FeedItem; native: NativeItem }> {
  return PARSED_FEED.items.map((item) => ({
    internal: {
      id: item.guid!,
      sourceName: "Test Feed",
      sourceUrl: FEED_URL,
      title: item.title ?? "",
      link: item.link ?? "",
      author: null,
      publishedAt: item.isoDate ?? null,
      updatedAt: null,
      summary: null,
      contentText: null,
      contentHtml: null,
      categories: [],
      language: "en",
      guid: item.guid ?? null,
      fetchedAt: new Date().toISOString(),
      contentHash: `hash-${item.guid}`,
      hasFullContent: false,
    },
    native: item.rawFields ?? {},
  }));
}

function makeMockStore(feedExists = false): StoreAdapter {
  return {
    initFeed: vi.fn().mockResolvedValue(undefined),
    ingest: vi.fn().mockResolvedValue(2),
    recordRefreshAttempt: vi.fn().mockResolvedValue(undefined),
    updatePollingMeta: vi.fn().mockResolvedValue(undefined),
    getFeedInfo: vi.fn().mockResolvedValue(null),
    getItem: vi.fn().mockResolvedValue(null),
    getAllItems: vi.fn().mockResolvedValue([]),
    getAllNativeItems: vi.fn().mockResolvedValue([]),
    storeObservedSchema: vi.fn().mockResolvedValue(undefined),
    getObservedSchema: vi.fn().mockResolvedValue(null),
    getNativeItem: vi.fn().mockResolvedValue(null),
    hasFeed: vi.fn().mockReturnValue(feedExists),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

describe("RefreshFeedUseCase", () => {
  it("returns newItems count on success", async () => {
    const store = makeMockStore(false);
    const fetcher = vi.fn().mockResolvedValue(SAMPLE_XML);
    const parser = vi.fn().mockResolvedValue(PARSED_FEED);
    const normalizer = vi.fn().mockReturnValue(makeNormalizedPairs());

    const useCase = new RefreshFeedUseCase(store, fetcher, parser, normalizer);
    const result = await useCase.execute(FEED_URL);

    expect("error" in result).toBe(false);
    const r = result as import("../../application/refresh-feed.use-case.js").RefreshResult;
    expect(r.newItems).toBe(2);
    expect(r.feedTitle).toBe("Test Feed");
    expect(r.feedUrl).toBe(FEED_URL);
  });

  it("calls initFeed when feed is new", async () => {
    const store = makeMockStore(false);
    const fetcher = vi.fn().mockResolvedValue(SAMPLE_XML);
    const parser = vi.fn().mockResolvedValue(PARSED_FEED);
    const normalizer = vi.fn().mockReturnValue(makeNormalizedPairs());

    const useCase = new RefreshFeedUseCase(store, fetcher, parser, normalizer);
    await useCase.execute(FEED_URL);

    expect(store.initFeed).toHaveBeenCalledWith(FEED_URL, "Test Feed");
  });

  it("does not call initFeed when feed already exists", async () => {
    const store = makeMockStore(true);
    const fetcher = vi.fn().mockResolvedValue(SAMPLE_XML);
    const parser = vi.fn().mockResolvedValue(PARSED_FEED);
    const normalizer = vi.fn().mockReturnValue(makeNormalizedPairs());

    const useCase = new RefreshFeedUseCase(store, fetcher, parser, normalizer);
    await useCase.execute(FEED_URL);

    expect(store.initFeed).not.toHaveBeenCalled();
  });

  it("records refresh attempt on success", async () => {
    const store = makeMockStore(true);
    const fetcher = vi.fn().mockResolvedValue(SAMPLE_XML);
    const parser = vi.fn().mockResolvedValue(PARSED_FEED);
    const normalizer = vi.fn().mockReturnValue(makeNormalizedPairs());

    const useCase = new RefreshFeedUseCase(store, fetcher, parser, normalizer);
    await useCase.execute(FEED_URL);

    expect(store.recordRefreshAttempt).toHaveBeenCalledWith(
      FEED_URL,
      expect.objectContaining({ success: true }),
    );
  });

  it("returns ToolError when fetcher throws", async () => {
    const store = makeMockStore(true);
    const fetcher = vi.fn().mockRejectedValue(new Error("Network error"));
    const parser = vi.fn();
    const normalizer = vi.fn();

    const useCase = new RefreshFeedUseCase(store, fetcher, parser, normalizer);
    const result = await useCase.execute(FEED_URL);

    expect("error" in result).toBe(true);
    expect((result as { error: string }).error).toBe("Refresh failed");
  });

  it("records failed refresh attempt when feed exists", async () => {
    const store = makeMockStore(true);
    const fetcher = vi.fn().mockRejectedValue(new Error("Timeout"));
    const parser = vi.fn();
    const normalizer = vi.fn();

    const useCase = new RefreshFeedUseCase(store, fetcher, parser, normalizer);
    await useCase.execute(FEED_URL);

    expect(store.recordRefreshAttempt).toHaveBeenCalledWith(
      FEED_URL,
      expect.objectContaining({ success: false }),
    );
  });
});
