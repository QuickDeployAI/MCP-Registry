import { describe, it, expect } from "vitest";
import { inspectSchema } from "../../introspection/schema-inspector.js";
import type { NativeItem } from "../../types.js";

function makeItems(overrides: NativeItem[] = []): NativeItem[] {
  return overrides.length > 0 ? overrides : [
    { title: "Article 1", pubDate: "2024-01-01T00:00:00.000Z", author: "Alice" },
    { title: "Article 2", pubDate: "2024-01-02T00:00:00.000Z", author: "Bob" },
    { title: "Article 3", pubDate: "2024-01-03T00:00:00.000Z" },
  ];
}

describe("inspectSchema", () => {
  it("handles empty items array gracefully", () => {
    const schema = inspectSchema("https://feed.example.com", []);
    expect(schema.fields).toHaveLength(0);
    expect(schema.itemCount).toBe(0);
    expect(schema.sourceFormat).toBe("unknown");
  });

  it("detects field presence correctly", () => {
    const items = makeItems();
    const schema = inspectSchema("https://feed.example.com", items);
    const authorField = schema.fields.find((f) => f.name === "author");
    expect(authorField).toBeDefined();
    // 2 out of 3 items have author
    expect(authorField!.presence).toBeCloseTo(2 / 3, 2);
  });

  it("infers datetime type for ISO-8601 strings", () => {
    const items = makeItems();
    const schema = inspectSchema("https://feed.example.com", items);
    const dateField = schema.fields.find((f) => f.name === "pubDate");
    expect(dateField?.type).toBe("datetime");
  });

  it("infers string type for regular strings", () => {
    const items = makeItems();
    const schema = inspectSchema("https://feed.example.com", items);
    const titleField = schema.fields.find((f) => f.name === "title");
    expect(titleField?.type).toBe("string");
  });

  it("infers boolean type", () => {
    const items: NativeItem[] = [{ flag: true }, { flag: false }];
    const schema = inspectSchema("https://feed.example.com", items);
    const flagField = schema.fields.find((f) => f.name === "flag");
    expect(flagField?.type).toBe("boolean");
  });

  it("infers number type", () => {
    const items: NativeItem[] = [{ duration: 120 }, { duration: 90 }];
    const schema = inspectSchema("https://feed.example.com", items);
    const field = schema.fields.find((f) => f.name === "duration");
    expect(field?.type).toBe("number");
  });

  it("marks large fields when avg length > 500 chars", () => {
    const longText = "A".repeat(600);
    const items: NativeItem[] = [{ description: longText }, { description: longText }];
    const schema = inspectSchema("https://feed.example.com", items);
    const field = schema.fields.find((f) => f.name === "description");
    expect(field?.large).toBe(true);
  });

  it("sets sortable=true for datetime fields", () => {
    const items = makeItems();
    const schema = inspectSchema("https://feed.example.com", items);
    const dateField = schema.fields.find((f) => f.name === "pubDate");
    expect(dateField?.sortable).toBe(true);
  });

  it("derives alias pubDate -> publishedAt", () => {
    const items = makeItems();
    const schema = inspectSchema("https://feed.example.com", items);
    const dateField = schema.fields.find((f) => f.name === "pubDate");
    expect(dateField?.alias).toBe("publishedAt");
  });

  it("detects rss2 format from pubDate field", () => {
    const items = makeItems();
    const schema = inspectSchema("https://feed.example.com", items);
    expect(schema.sourceFormat).toBe("rss2");
  });

  it("detects atom format from updated field", () => {
    const items: NativeItem[] = [
      { title: "Entry", updated: "2024-01-01T00:00:00.000Z" },
    ];
    const schema = inspectSchema("https://feed.example.com", items);
    expect(schema.sourceFormat).toBe("atom");
  });
});

describe("inspectSchema - allowedOperators", () => {
  it("string[] fields include =contains= in allowedOperators", () => {
    const items: NativeItem[] = [
      { tags: ["tech", "ai"] },
      { tags: ["news"] },
    ];
    const schema = inspectSchema("https://feed.example.com", items);
    const tagsField = schema.fields.find((f) => f.name === "tags");
    expect(tagsField?.type).toBe("string[]");
    expect(tagsField?.allowedOperators).toContain("=contains=");
  });
});
