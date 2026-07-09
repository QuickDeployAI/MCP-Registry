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

  it("uses the sourceFormat passed directly", () => {
    const schema = inspectSchema("https://feed.example.com", makeItems(), "rss2");
    expect(schema.sourceFormat).toBe("rss2");
  });

  it("defaults sourceFormat to 'unknown' when not provided", () => {
    const schema = inspectSchema("https://feed.example.com", makeItems());
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

  it("sets sortable=true for datetime fields (derived from type, not field name)", () => {
    const items = makeItems();
    const schema = inspectSchema("https://feed.example.com", items);
    const dateField = schema.fields.find((f) => f.name === "pubDate");
    expect(dateField?.sortable).toBe(true);
  });

  it("sets filterable=true for string fields (derived from type)", () => {
    const items = makeItems();
    const schema = inspectSchema("https://feed.example.com", items);
    const titleField = schema.fields.find((f) => f.name === "title");
    expect(titleField?.filterable).toBe(true);
  });

  it("sets filterable=true for number fields (derived from type)", () => {
    const items: NativeItem[] = [{ count: 5 }];
    const schema = inspectSchema("https://feed.example.com", items);
    const field = schema.fields.find((f) => f.name === "count");
    expect(field?.filterable).toBe(true);
  });

  it("sets filterable=false for object fields (not a scalar type)", () => {
    const items: NativeItem[] = [{ nested: { a: 1 } }];
    const schema = inspectSchema("https://feed.example.com", items);
    const field = schema.fields.find((f) => f.name === "nested");
    expect(field?.filterable).toBe(false);
  });

  it("sets searchable=false for large string fields", () => {
    const longText = "A".repeat(600);
    const items: NativeItem[] = [{ body: longText }, { body: longText }];
    const schema = inspectSchema("https://feed.example.com", items);
    const field = schema.fields.find((f) => f.name === "body");
    expect(field?.searchable).toBe(false);
  });

  it("does not include an alias field on ObservedFieldSchema", () => {
    const items = makeItems();
    const schema = inspectSchema("https://feed.example.com", items);
    const pubDate = schema.fields.find((f) => f.name === "pubDate");
    expect(pubDate).toBeDefined();
    expect("alias" in pubDate!).toBe(false);
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

  it("datetime fields include comparison operators", () => {
    const items = makeItems();
    const schema = inspectSchema("https://feed.example.com", items);
    const dateField = schema.fields.find((f) => f.name === "pubDate");
    expect(dateField?.allowedOperators).toContain("=gt=");
    expect(dateField?.allowedOperators).toContain("=ge=");
    expect(dateField?.allowedOperators).toContain("=lt=");
  });

  it("number fields include comparison operators", () => {
    const items: NativeItem[] = [{ score: 42 }];
    const schema = inspectSchema("https://feed.example.com", items);
    const field = schema.fields.find((f) => f.name === "score");
    expect(field?.allowedOperators).toContain("=gt=");
    expect(field?.allowedOperators).toContain("=le=");
  });
});
