import { describe, it, expect } from "vitest";
import { executeQuery } from "../../query/executor.js";
import type { FeedQuery } from "../../types.js";

const opts = { maxResults: 50, maxFieldSize: 500 };

function makeItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    _id: "a".repeat(64), // SHA-256 hash placeholder
    _fetchedAt: "2024-06-01T01:00:00.000Z",
    title: "Test Article",
    link: "https://example.com/a",
    pubDate: "2024-06-01T00:00:00.000Z",
    description: "Short summary",
    contentHtml: "<p>" + "B".repeat(1000) + "</p>",
    categories: [{ name: "Tech" }],
    ...overrides,
  };
}

describe("executeQuery - field selection", () => {
  it("returns default fields when no select is specified", () => {
    const items = [makeItem()];
    const result = executeQuery(items, {}, opts);
    expect(result.errors).toBeUndefined();
    const record = result.result!.items[0];
    expect(record).toHaveProperty("_id");
    expect(record).toHaveProperty("title");
  });

  it("returns only requested fields with select", () => {
    const items = [makeItem()];
    const result = executeQuery(items, { select: ["_id", "title"] }, opts);
    const record = result.result!.items[0];
    expect(Object.keys(record)).toEqual(["_id", "title"]);
  });

  it("large string fields return a marker when explicitly selected", () => {
    const items = [makeItem({ bigField: "X".repeat(600) })];
    const result = executeQuery(items, { select: ["_id", "bigField"] }, opts);
    const record = result.result!.items[0];
    expect((record.bigField as { type: string }).type).toBe("large-field");
  });
});

describe("executeQuery - filtering", () => {
  it("filters by field value", () => {
    const items = [
      makeItem({ title: "AI-News" }),
      makeItem({ title: "Sports-Update" }),
    ];
    const result = executeQuery(items, { filter: "title==AI-News" }, opts);
    expect(result.result!.items).toHaveLength(1);
  });

  it("returns error for invalid filter", () => {
    const items = [makeItem()];
    const result = executeQuery(items, { filter: "invalid!!filter" }, opts);
    expect(result.errors).toBeDefined();
  });
});

describe("executeQuery - search", () => {
  it("filters items matching search query", () => {
    const items = [
      makeItem({ title: "OpenAI GPT-5 Announcement" }),
      makeItem({ title: "Stock Market Update" }),
    ];
    const result = executeQuery(items, { search: "OpenAI" }, opts);
    expect(result.result!.items).toHaveLength(1);
  });
});

describe("executeQuery - sorting", () => {
  it("sorts by pubDate descending", () => {
    const items = [
      makeItem({ _id: "a".repeat(64), pubDate: "2024-01-01T00:00:00.000Z" }),
      makeItem({ _id: "b".repeat(64), pubDate: "2024-12-01T00:00:00.000Z" }),
    ];
    const result = executeQuery(items, { orderBy: ["pubDate desc"] }, opts);
    expect(result.result!.items[0].pubDate).toBe("2024-12-01T00:00:00.000Z");
  });
});

describe("executeQuery - pagination", () => {
  it("respects top and skip", () => {
    const items = Array.from({ length: 20 }, (_, i) => makeItem({ _id: `item-${i}` }));
    const result = executeQuery(items, { top: 5, skip: 5 }, opts);
    expect(result.result!.returned).toBe(5);
    expect(result.result!.skip).toBe(5);
  });

  it("returns totalMatched correctly", () => {
    const items = Array.from({ length: 15 }, () => makeItem());
    const result = executeQuery(items, { top: 5 }, opts);
    expect(result.result!.totalMatched).toBe(15);
    expect(result.result!.returned).toBe(5);
  });
});

describe("executeQuery - validation errors", () => {
  it("allows arbitrary field names in select (no error)", () => {
    const items = [makeItem()];
    const result = executeQuery(items, { select: ["itunes:duration", "media:content"] }, opts);
    expect(result.errors).toBeUndefined();
  });

  it("allows ordering by any field name (no error)", () => {
    const items = [makeItem()];
    const result = executeQuery(items, { orderBy: ["pubDate desc"] }, opts);
    expect(result.errors).toBeUndefined();
  });

  it("returns error for invalid sort direction", () => {
    const items = [makeItem()];
    const result = executeQuery(items, { orderBy: ["pubDate sideways"] }, opts);
    expect(result.errors).toBeDefined();
    expect(result.errors![0].field).toBe("orderBy");
  });

  it("returns error for top exceeding maxResults", () => {
    const items = [makeItem()];
    const result = executeQuery(items, { top: 1000 }, { maxResults: 50, maxFieldSize: 500 });
    expect(result.errors).toBeDefined();
  });
});

describe("executeQuery - field projection", () => {
  it("projects fields that exist on the item", () => {
    const items = [makeItem({ customField: "custom-value" })];
    const result = executeQuery(items, { select: ["_id", "customField"] }, opts);
    expect(result.errors).toBeUndefined();
    const record = result.result!.items[0] as Record<string, unknown>;
    expect(record["customField"]).toBe("custom-value");
  });

  it("returns undefined for fields not present on the item", () => {
    const items = [makeItem()];
    const result = executeQuery(items, { select: ["nonExistentField"] }, opts);
    const record = result.result!.items[0];
    expect(record["nonExistentField"]).toBeUndefined();
  });
});
