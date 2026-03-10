import { describe, it, expect } from "vitest";
import { executeQuery } from "../../query/executor.js";
import type { FeedItem, FeedQuery } from "../../types.js";

const opts = { maxResults: 50, maxFieldSize: 500 };

function makeItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    id: `item-${Math.random().toString(36).slice(2)}`,
    sourceName: "Feed",
    sourceUrl: "https://example.com",
    title: "Test Article",
    link: "https://example.com/a",
    author: "Author",
    publishedAt: "2024-06-01T00:00:00.000Z",
    updatedAt: null,
    summary: "Short summary",
    contentText: "A".repeat(1000),
    contentHtml: "<p>" + "B".repeat(1000) + "</p>",
    categories: ["Tech"],
    language: "en",
    guid: "g1",
    fetchedAt: "2024-06-01T01:00:00.000Z",
    contentHash: "h1",
    hasFullContent: true,
    ...overrides,
  };
}

describe("executeQuery - field selection", () => {
  it("returns default fields when no select is specified", () => {
    const items = [makeItem()];
    const result = executeQuery(items, [], {}, opts);
    expect(result.errors).toBeUndefined();
    const record = result.result!.items[0];
    expect(record).toHaveProperty("id");
    expect(record).toHaveProperty("title");
    expect(record).toHaveProperty("publishedAt");
    expect(record).not.toHaveProperty("contentText");
    expect(record).not.toHaveProperty("contentHtml");
  });

  it("returns only requested fields with select", () => {
    const items = [makeItem()];
    const result = executeQuery(items, [], { select: ["id", "title"] }, opts);
    const record = result.result!.items[0];
    expect(Object.keys(record)).toEqual(["id", "title"]);
  });

  it("large fields are excluded from default select", () => {
    const items = [makeItem()];
    const result = executeQuery(items, [], {}, opts);
    const record = result.result!.items[0];
    expect(record).not.toHaveProperty("contentText");
    expect(record).not.toHaveProperty("contentHtml");
  });

  it("large fields return a marker object when explicitly selected", () => {
    const items = [makeItem()];
    const result = executeQuery(items, [], { select: ["id", "contentText"] }, opts);
    const record = result.result!.items[0];
    expect(record.contentText).toEqual({
      type: "large-field",
      hint: expect.stringContaining("get_feed_item"),
    });
  });
});

describe("executeQuery - filtering", () => {
  it("filters by field value", () => {
    const items = [
      makeItem({ title: "AI-News" }),
      makeItem({ title: "Sports-Update", contentHash: "h2", id: "item-2" }),
    ];
    const result = executeQuery(items, [], { filter: "title==AI-News" }, opts);
    expect(result.result!.items).toHaveLength(1);
  });

  it("returns error for invalid filter", () => {
    const items = [makeItem()];
    const result = executeQuery(items, [], { filter: "invalid!!filter" }, opts);
    expect(result.errors).toBeDefined();
  });
});

describe("executeQuery - search", () => {
  it("filters items matching search query", () => {
    const items = [
      makeItem({ title: "OpenAI GPT-5 Announcement" }),
      makeItem({ title: "Stock Market Update" }),
    ];
    const result = executeQuery(items, [], { search: "OpenAI" }, opts);
    expect(result.result!.items).toHaveLength(1);
  });
});

describe("executeQuery - sorting", () => {
  it("sorts by publishedAt descending", () => {
    const items = [
      makeItem({ id: "old", publishedAt: "2024-01-01T00:00:00.000Z" }),
      makeItem({ id: "new", publishedAt: "2024-12-01T00:00:00.000Z" }),
    ];
    const result = executeQuery(items, [], { orderBy: ["publishedAt desc"] }, opts);
    expect(result.result!.items[0].publishedAt).toBe("2024-12-01T00:00:00.000Z");
  });
});

describe("executeQuery - pagination", () => {
  it("respects top and skip", () => {
    const items = Array.from({ length: 20 }, (_, i) => makeItem({ id: `item-${i}` }));
    const result = executeQuery(items, [], { top: 5, skip: 5 }, opts);
    expect(result.result!.returned).toBe(5);
    expect(result.result!.skip).toBe(5);
  });

  it("returns totalMatched correctly", () => {
    const items = Array.from({ length: 15 }, () => makeItem());
    const result = executeQuery(items, [], { top: 5 }, opts);
    expect(result.result!.totalMatched).toBe(15);
    expect(result.result!.returned).toBe(5);
  });
});

describe("executeQuery - validation errors", () => {
  it("allows arbitrary native field names in select (no error)", () => {
    const items = [makeItem()];
    const result = executeQuery(items, [], { select: ["itunes:duration", "media:content"] }, opts);
    expect(result.errors).toBeUndefined();
  });

  it("allows ordering by native field names (no error)", () => {
    const items = [makeItem()];
    const result = executeQuery(items, [], { orderBy: ["pubDate desc"] }, opts);
    expect(result.errors).toBeUndefined();
  });

  it("returns error for invalid sort direction", () => {
    const items = [makeItem()];
    const result = executeQuery(items, [], { orderBy: ["publishedAt sideways"] }, opts);
    expect(result.errors).toBeDefined();
    expect(result.errors![0].field).toBe("orderBy");
  });

  it("returns error for top exceeding maxResults", () => {
    const items = [makeItem()];
    const result = executeQuery(items, [], { top: 1000 }, { maxResults: 50, maxFieldSize: 500 });
    expect(result.errors).toBeDefined();
  });
});

describe("executeQuery - native field projection", () => {
  it("projects native fields from nativeItems", () => {
    const items = [makeItem({ id: "n1" })];
    const nativeItems = [{ "dc:creator": "Alice", "itunes:duration": "3600" }];
    const result = executeQuery(items, nativeItems, { select: ["dc:creator", "itunes:duration"] }, opts);
    expect(result.errors).toBeUndefined();
    const record = result.result!.items[0] as Record<string, unknown>;
    expect(record["dc:creator"]).toBe("Alice");
    expect(record["itunes:duration"]).toBe("3600");
  });

  it("falls back to internal field when native item is empty", () => {
    const items = [makeItem({ id: "n2", author: "Bob" })];
    const result = executeQuery(items, [], { select: ["author"] }, opts);
    const record = result.result!.items[0];
    expect(record["author"]).toBe("Bob");
  });
});
