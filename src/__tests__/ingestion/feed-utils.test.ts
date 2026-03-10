import { describe, it, expect } from "vitest";
import {
  extractFeedMeta,
  extractItems,
  computeContentHash,
} from "../../ingestion/feed-utils.js";

// ── extractFeedMeta ──────────────────────────────────────────────────────────

describe("extractFeedMeta", () => {
  it("extracts title and description from RSS feed", () => {
    const envelope = {
      format: "rss" as const,
      feed: { title: "My Feed", description: "A feed", language: "en", items: [] },
    };
    const meta = extractFeedMeta(envelope);
    expect(meta.title).toBe("My Feed");
    expect(meta.description).toBe("A feed");
    expect(meta.language).toBe("en");
  });

  it("extracts title from Atom feed", () => {
    const envelope = {
      format: "atom" as const,
      feed: { title: "Atom Feed", entries: [] },
    };
    const meta = extractFeedMeta(envelope);
    expect(meta.title).toBe("Atom Feed");
  });

  it("extracts title and description from JSON Feed", () => {
    const envelope = {
      format: "json" as const,
      feed: { title: "JSON Feed", description: "A JSON feed", language: "en", items: [] },
    };
    const meta = extractFeedMeta(envelope);
    expect(meta.title).toBe("JSON Feed");
    expect(meta.description).toBe("A JSON feed");
  });

  it("returns undefined for missing fields", () => {
    const envelope = { format: "rss" as const, feed: { items: [] } };
    const meta = extractFeedMeta(envelope);
    expect(meta.title).toBeUndefined();
    expect(meta.description).toBeUndefined();
  });
});

// ── extractItems ─────────────────────────────────────────────────────────────

describe("extractItems", () => {
  it("returns feed.items for RSS", () => {
    const envelope = {
      format: "rss" as const,
      feed: { items: [{ title: "Item 1" }, { title: "Item 2" }] },
    };
    expect(extractItems(envelope)).toHaveLength(2);
  });

  it("returns feed.entries for Atom", () => {
    const envelope = {
      format: "atom" as const,
      feed: { entries: [{ title: "Entry 1" }] },
    };
    expect(extractItems(envelope)).toHaveLength(1);
  });

  it("returns feed.items for JSON Feed", () => {
    const envelope = {
      format: "json" as const,
      feed: { items: [{ id: "1", title: "JSON Item" }] },
    };
    expect(extractItems(envelope)).toHaveLength(1);
  });

  it("returns empty array when no items", () => {
    const envelope = { format: "rss" as const, feed: {} };
    expect(extractItems(envelope)).toHaveLength(0);
  });

  it("items are returned as-is (no transformation)", () => {
    const raw = { id: "x", title: "T", customField: 42 };
    const envelope = { format: "rss" as const, feed: { items: [raw] } };
    expect(extractItems(envelope)[0]).toStrictEqual(raw);
  });
});

// ── computeContentHash ───────────────────────────────────────────────────────

describe("computeContentHash", () => {
  it("returns 64-char hex string", () => {
    const hash = computeContentHash({ title: "Test" });
    expect(hash).toHaveLength(64);
    expect(/^[0-9a-f]+$/.test(hash)).toBe(true);
  });

  it("returns same hash for identical items", () => {
    const item = { title: "Test", link: "https://example.com" };
    expect(computeContentHash(item)).toBe(computeContentHash(item));
  });

  it("returns different hashes for different items", () => {
    expect(computeContentHash({ a: 1 })).not.toBe(computeContentHash({ a: 2 }));
  });

  it("works on any shape — no assumed fields", () => {
    const arbitrary = { foo: "bar", nested: { x: 1 }, arr: [1, 2, 3] };
    const hash = computeContentHash(arbitrary);
    expect(hash).toHaveLength(64);
  });
});

