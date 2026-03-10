import { describe, it, expect, beforeEach } from "vitest";
import { MemoryStore } from "../../store/index.js";
import type { ObservedFeedSchema } from "../../types.js";

const FEED_URL = "https://example.com/feed.rss";

function makeItem(id: string): Record<string, unknown> {
  return {
    title: "T",
    pubDate: "2024-01-01T00:00:00.000Z",
    guid: { value: id },
  };
}

function makeSchema(): ObservedFeedSchema {
  return {
    feedUrl: FEED_URL,
    sourceFormat: "rss2",
    observedAt: new Date().toISOString(),
    itemCount: 1,
    fields: [
      {
        name: "title",
        type: "string",
        presence: 1,
        selectable: true,
        filterable: true,
        searchable: true,
        sortable: false,
        large: false,
        example: "T",
        allowedOperators: ["==", "!=", "=like="],
      },
    ],
  };
}

describe("MemoryStore - items as native items", () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore(100);
  });

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

  it("stored items contain original feed fields and _id (hash) + _fetchedAt", async () => {
    await store.initFeed(FEED_URL, "Feed");
    await store.ingest(FEED_URL, [makeItem("item-1")]);
    const items = await store.getAllItems(FEED_URL);
    expect(items[0].title).toBe("T");
    expect(items[0].pubDate).toBe("2024-01-01T00:00:00.000Z");
    expect(typeof items[0]._id).toBe("string");
    expect((items[0]._id as string)).toHaveLength(64);
  });

  it("getItem looks up by content hash (_id)", async () => {
    await store.initFeed(FEED_URL, "Feed");
    await store.ingest(FEED_URL, [makeItem("item-1")]);
    const items = await store.getAllItems(FEED_URL);
    const id = items[0]._id as string;
    const found = await store.getItem(FEED_URL, id);
    expect(found).not.toBeNull();
  });

  it("getAllItems returns items in newest-first order", async () => {
    await store.initFeed(FEED_URL, "Feed");
    await store.ingest(FEED_URL, [makeItem("a"), makeItem("b")]);
    const items = await store.getAllItems(FEED_URL);
    expect(items).toHaveLength(2);
    // All _ids are SHA-256 hashes (64 hex chars)
    expect((items[0]._id as string)).toHaveLength(64);
    expect((items[1]._id as string)).toHaveLength(64);
  });
});
