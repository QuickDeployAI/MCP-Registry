import { describe, it, expect, beforeEach } from "vitest";
import { MemoryStore } from "../../store/index.js";
import type { ObservedFeedSchema } from "../../types.js";
import type { IngestPair } from "../../store/adapter.js";

const FEED_URL = "https://example.com/feed.rss";

function makePair(id: string): IngestPair {
  return {
    internal: {
      id, sourceName: "Feed", sourceUrl: FEED_URL, title: "T", link: "", author: null,
      publishedAt: null, updatedAt: null, summary: null, contentText: null, contentHtml: null,
      categories: [], language: null, guid: id, fetchedAt: new Date().toISOString(),
      contentHash: `h-${id}`, hasFullContent: false,
    },
    native: { title: "T", pubDate: "2024-01-01T00:00:00.000Z", "dc:creator": "Alice" },
  };
}

function makeSchema(): ObservedFeedSchema {
  return {
    feedUrl: FEED_URL, sourceFormat: "rss2",
    observedAt: new Date().toISOString(), itemCount: 1,
    fields: [{ name: "title", type: "string", presence: 1, selectable: true, filterable: false,
      searchable: true, sortable: false, large: false, example: "T", alias: null, allowedOperators: ["==", "!=", "=like="] }],
  };
}

describe("MemoryStore - native item methods", () => {
  let store: MemoryStore;

  beforeEach(() => { store = new MemoryStore(100); });

  it("storeObservedSchema and getObservedSchema round-trip", async () => {
    await store.initFeed(FEED_URL, "Feed");
    const schema = makeSchema();
    await store.storeObservedSchema(FEED_URL, schema);
    const retrieved = await store.getObservedSchema(FEED_URL);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.feedUrl).toBe(FEED_URL);
    expect(retrieved!.fields).toHaveLength(1);
  });

  it("getObservedSchema returns null before schema is stored", async () => {
    await store.initFeed(FEED_URL, "Feed");
    const schema = await store.getObservedSchema(FEED_URL);
    expect(schema).toBeNull();
  });

  it("getNativeItem returns stored native item", async () => {
    await store.initFeed(FEED_URL, "Feed");
    await store.ingest(FEED_URL, [makePair("item-1")]);
    const native = await store.getNativeItem(FEED_URL, "item-1");
    expect(native).not.toBeNull();
    expect(native!["title"]).toBe("T");
  });

  it("getNativeItem returns null for unknown id", async () => {
    await store.initFeed(FEED_URL, "Feed");
    const native = await store.getNativeItem(FEED_URL, "nonexistent");
    expect(native).toBeNull();
  });

  it("getAllNativeItems returns items in same order as getAllItems", async () => {
    await store.initFeed(FEED_URL, "Feed");
    await store.ingest(FEED_URL, [makePair("a"), makePair("b")]);
    const items = await store.getAllItems(FEED_URL);
    const natives = await store.getAllNativeItems(FEED_URL);
    expect(natives).toHaveLength(items.length);
  });
});
