import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileStore } from "../../store/file-store.js";
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

describe("FileStore", () => {
  let tmpDir: string;
  let store: FileStore;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "rss2mcp-filestore-test-"));
    store = new FileStore(tmpDir, 100);
  });

  afterEach(async () => {
    await store.close();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("initFeed creates feed entry", async () => {
    await store.initFeed(FEED_URL, "Test Feed");
    expect(store.hasFeed(FEED_URL)).toBe(true);
  });

  it("ingest persists items and returns correct new count", async () => {
    await store.initFeed(FEED_URL, "Feed");
    const pairs = [makePair({ id: "a" }), makePair({ id: "b" })];
    const count = await store.ingest(FEED_URL, pairs);
    expect(count).toBe(2);
  });

  it("correctly identifies truly new items (file-store bug fix)", async () => {
    await store.initFeed(FEED_URL, "Feed");
    const pair1 = makePair({ id: "x", contentHash: "hx" });
    await store.ingest(FEED_URL, [pair1]);

    // Second ingest with same item should return 0
    const count = await store.ingest(FEED_URL, [pair1]);
    expect(count).toBe(0);
  });

  it("loads persisted data on restart", async () => {
    await store.initFeed(FEED_URL, "Feed");
    await store.ingest(FEED_URL, [makePair({ id: "persist-1" })]);
    await store.close();

    // Create new store pointing to same directory
    const store2 = new FileStore(tmpDir, 100);
    await store2.load();

    expect(store2.hasFeed(FEED_URL)).toBe(true);
    const items = await store2.getAllItems(FEED_URL);
    expect(items.some((i) => i.id === "persist-1")).toBe(true);
    await store2.close();
  });

  it("persists feed metadata across restarts", async () => {
    await store.initFeed(FEED_URL, "My Feed");
    await store.recordRefreshAttempt(FEED_URL, {
      success: true,
      feedTitle: "My Feed Updated",
    });
    await store.close();

    const store2 = new FileStore(tmpDir, 100);
    await store2.load();
    const info = await store2.getFeedInfo(FEED_URL);
    expect(info?.feedTitle).toBe("My Feed Updated");
    expect(info?.lastRefreshSucceededAt).not.toBeNull();
    await store2.close();
  });

  it("getItem returns null for non-existent id", async () => {
    await store.initFeed(FEED_URL, "Feed");
    const item = await store.getItem(FEED_URL, "nonexistent");
    expect(item).toBeNull();
  });
});
