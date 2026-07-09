import { describe, it, expect } from "vitest";
import { compileFilter } from "../../query/filter.js";

function makeItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    _id: "abc123",
    title: "Hello World",
    link: "https://example.com/article",
    pubDate: "2024-06-15T10:00:00.000Z",
    description: "A short summary",
    categories: [{ name: "Tech" }, { name: "AI" }],
    language: "en",
    guid: { value: "guid-1" },
    ...overrides,
  };
}

describe("compileFilter - equality operators", () => {
  it("== matches exact string", () => {
    const f = compileFilter('title=="Hello World"');
    expect(f.test(makeItem())).toBe(true);
    expect(f.test(makeItem({ title: "Goodbye" }))).toBe(false);
  });

  it("!= matches non-equal string", () => {
    const f = compileFilter('title!="Goodbye"');
    expect(f.test(makeItem())).toBe(true);
    expect(f.test(makeItem({ title: "Goodbye" }))).toBe(false);
  });

  it("== supports wildcard *", () => {
    const f = compileFilter("title==Hello*");
    expect(f.test(makeItem())).toBe(true);
    expect(f.test(makeItem({ title: "Goodbye World" }))).toBe(false);
  });
});

describe("compileFilter - comparison operators", () => {
  it("=gt= greater than date", () => {
    const f = compileFilter("pubDate=gt=2024-01-01T00:00:00Z");
    expect(f.test(makeItem())).toBe(true);
    expect(f.test(makeItem({ pubDate: "2023-12-31T00:00:00.000Z" }))).toBe(false);
  });

  it("=ge= greater than or equal", () => {
    const f = compileFilter("pubDate=ge=2024-06-15T10:00:00Z");
    expect(f.test(makeItem())).toBe(true);
  });

  it("=lt= less than date", () => {
    const f = compileFilter("pubDate=lt=2025-01-01T00:00:00Z");
    expect(f.test(makeItem())).toBe(true);
    expect(f.test(makeItem({ pubDate: "2026-01-01T00:00:00.000Z" }))).toBe(false);
  });

  it("=le= less than or equal", () => {
    const f = compileFilter("pubDate=le=2024-06-15T10:00:00Z");
    expect(f.test(makeItem())).toBe(true);
  });
});

describe("compileFilter - string operators", () => {
  it("=like= matches substring pattern", () => {
    const f = compileFilter("title=like=*World*");
    expect(f.test(makeItem())).toBe(true);
    expect(f.test(makeItem({ title: "No match" }))).toBe(false);
  });

  it("=contains= matches array of strings", () => {
    const f = compileFilter("tags=contains=AI");
    expect(f.test({ tags: ["AI", "Tech"] })).toBe(true);
    expect(f.test({ tags: ["News"] })).toBe(false);
  });
});

describe("compileFilter - logical operators", () => {
  it("; is AND logic", () => {
    const f = compileFilter('title=="Hello World";language==en');
    expect(f.test(makeItem())).toBe(true);
    expect(f.test(makeItem({ language: "fr" }))).toBe(false);
  });

  it(", is OR logic", () => {
    const f = compileFilter('title=="Hello World",title=="Goodbye"');
    expect(f.test(makeItem())).toBe(true);
    expect(f.test(makeItem({ title: "Goodbye" }))).toBe(true);
    expect(f.test(makeItem({ title: "Unknown" }))).toBe(false);
  });

  it("supports grouped expressions", () => {
    const f = compileFilter('(title=="Hello World",title=="Hi");language==en');
    expect(f.test(makeItem())).toBe(true);
    expect(f.test(makeItem({ title: "Hi" }))).toBe(true);
    expect(f.test(makeItem({ title: "Hello World", language: "fr" }))).toBe(false);
  });
});

describe("compileFilter - error handling", () => {
  it("throws on invalid operator", () => {
    expect(() => compileFilter("title=xyz=value")).toThrow();
  });
});

describe("compileFilter - any field is filterable", () => {
  it("filters on custom / namespaced field", () => {
    const f = compileFilter('customField=="yes"');
    expect(f.test({ customField: "yes" })).toBe(true);
    expect(f.test({ customField: "no" })).toBe(false);
  });

  it("accepts pubDate filter expression", () => {
    const f = compileFilter("pubDate=ge=2024-01-01T00:00:00Z");
    expect(f.test(makeItem())).toBe(true);
    expect(f.test(makeItem({ pubDate: "2023-01-01T00:00:00.000Z" }))).toBe(false);
  });
});
