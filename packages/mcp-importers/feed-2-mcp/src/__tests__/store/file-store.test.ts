import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileStore } from "../../store/file-store.js";

const FEED_URL = "https://example.com/feed.rss";

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
    const count = await store.ingest(FEED_URL, [makeItem("a"), makeItem("b")]);
    expect(count).toBe(2);
  });

  it("deduplicates items on re-ingest", async () => {
    await store.initFeed(FEED_URL, "Feed");
    const item = makeItem("x");
    await store.ingest(FEED_URL, [item]);
    const count = await store.ingest(FEED_URL, [item]);
    expect(count).toBe(0);
  });

  it("loads persisted data on restart", async () => {
    await store.initFeed(FEED_URL, "Feed");
    const item = makeItem("persist-1");
    await store.ingest(FEED_URL, [item]);
    await store.close();

    const store2 = new FileStore(tmpDir, 100);
    await store2.load();

    expect(store2.hasFeed(FEED_URL)).toBe(true);
    const items = await store2.getAllItems(FEED_URL);
    // Items have _id (SHA-256 hash) and _fetchedAt added
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("Test Article");
    await store2.close();
  });

  it("persists feed metadata across restarts", async () => {
    await store.initFeed(FEED_URL, "My Feed");
    await store.recordRefreshAttempt(FEED_URL, { success: true, feedTitle: "My Feed Updated" });
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
