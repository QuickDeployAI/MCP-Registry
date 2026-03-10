import { describe, it, expect } from "vitest";
import { compileFilter } from "../../query/filter.js";
import type { FeedItem } from "../../types.js";

function makeItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    id: "abc123",
    sourceName: "Test Feed",
    sourceUrl: "https://example.com/feed",
    title: "Hello World",
    link: "https://example.com/article",
    author: "Jane Doe",
    publishedAt: "2024-06-15T10:00:00.000Z",
    updatedAt: null,
    summary: "A short summary",
    contentText: null,
    contentHtml: null,
    categories: ["Tech", "AI"],
    language: "en",
    guid: "guid-1",
    fetchedAt: "2024-06-15T11:00:00.000Z",
    contentHash: "hash1",
    hasFullContent: false,
    ...overrides,
  };
}

describe("compileFilter - equality operators", () => {
  it("== matches exact string", () => {
    const f = compileFilter('author=="Jane Doe"');
    expect(f.test(makeItem())).toBe(true);
    expect(f.test(makeItem({ author: "John" }))).toBe(false);
  });

  it("!= matches non-equal string", () => {
    const f = compileFilter('author!="John Smith"');
    expect(f.test(makeItem())).toBe(true);
    expect(f.test(makeItem({ author: "John Smith" }))).toBe(false);
  });

  it("== supports wildcard *", () => {
    const f = compileFilter("title==Hello*");
    expect(f.test(makeItem())).toBe(true);
    expect(f.test(makeItem({ title: "Goodbye World" }))).toBe(false);
  });
});

describe("compileFilter - comparison operators", () => {
  it("=gt= greater than date", () => {
    const f = compileFilter("publishedAt=gt=2024-01-01T00:00:00Z");
    expect(f.test(makeItem())).toBe(true);
    expect(f.test(makeItem({ publishedAt: "2023-12-31T00:00:00.000Z" }))).toBe(false);
  });

  it("=ge= greater than or equal", () => {
    const f = compileFilter("publishedAt=ge=2024-06-15T10:00:00Z");
    expect(f.test(makeItem())).toBe(true);
  });

  it("=lt= less than date", () => {
    const f = compileFilter("publishedAt=lt=2025-01-01T00:00:00Z");
    expect(f.test(makeItem())).toBe(true);
    expect(f.test(makeItem({ publishedAt: "2026-01-01T00:00:00.000Z" }))).toBe(false);
  });

  it("=le= less than or equal", () => {
    const f = compileFilter("publishedAt=le=2024-06-15T10:00:00Z");
    expect(f.test(makeItem())).toBe(true);
  });
});

describe("compileFilter - string operators", () => {
  it("=like= matches substring pattern", () => {
    const f = compileFilter("title=like=*World*");
    expect(f.test(makeItem())).toBe(true);
    expect(f.test(makeItem({ title: "No match" }))).toBe(false);
  });

  it("=contains= matches array element", () => {
    const f = compileFilter("categories=contains=AI");
    expect(f.test(makeItem())).toBe(true);
    expect(f.test(makeItem({ categories: ["News"] }))).toBe(false);
  });
});

describe("compileFilter - logical operators", () => {
  it("; is AND logic", () => {
    const f = compileFilter('author=="Jane Doe";language==en');
    expect(f.test(makeItem())).toBe(true);
    expect(f.test(makeItem({ language: "fr" }))).toBe(false);
  });

  it(", is OR logic", () => {
    const f = compileFilter('author=="Jane Doe",author=="John Smith"');
    expect(f.test(makeItem())).toBe(true);
    expect(f.test(makeItem({ author: "John Smith" }))).toBe(true);
    expect(f.test(makeItem({ author: "Unknown" }))).toBe(false);
  });

  it("supports grouped expressions", () => {
    const f = compileFilter('(author=="Jane Doe",author=="John Smith");language==en');
    expect(f.test(makeItem())).toBe(true);
    expect(f.test(makeItem({ author: "John Smith" }))).toBe(true);
    expect(f.test(makeItem({ author: "Jane Doe", language: "fr" }))).toBe(false);
  });
});

describe("compileFilter - error handling", () => {
  it("throws on non-filterable field", () => {
    expect(() => compileFilter("summary==hello")).toThrow();
  });

  it("throws on invalid operator", () => {
    expect(() => compileFilter("title=xyz=value")).toThrow();
  });
});

describe("compileFilter - native field alias resolution", () => {
  it("accepts pubDate as alias for publishedAt", () => {
    const f = compileFilter("pubDate=ge=2024-01-01T00:00:00Z");
    expect(f.test(makeItem({ publishedAt: "2024-06-15T10:00:00.000Z" }))).toBe(true);
    expect(f.test(makeItem({ publishedAt: "2023-01-01T00:00:00.000Z" }))).toBe(false);
  });

  it("accepts dc:creator as alias for author", () => {
    const f = compileFilter('dc:creator=="Jane Doe"');
    expect(f.test(makeItem())).toBe(true);
    expect(f.test(makeItem({ author: "John" }))).toBe(false);
  });
});
