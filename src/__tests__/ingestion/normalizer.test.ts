import { describe, it, expect } from "vitest";
import { normalizeItem, normalizeFeed } from "../../ingestion/normalizer.js";
import type { ParsedFeed, ParsedItem } from "../../ingestion/parser.js";

const baseFeed: ParsedFeed = {
  title: "Test Feed",
  feedUrl: "https://example.com/feed.rss",
  description: "A test feed",
  language: "en",
  items: [],
};

const baseItem: ParsedItem = {
  guid: "item-1",
  title: "Test Article",
  link: "https://example.com/article-1",
  author: "Jane Doe",
  isoDate: "2024-01-15T10:00:00.000Z",
  summary: "A short summary",
  content: "<p>Hello <strong>world</strong></p>",
  rawFields: { title: "Test Article", content: "<p>Hello <strong>world</strong></p>" },
};

describe("normalizeItem", () => {
  it("strips HTML tags from content to produce contentText", () => {
    const { internal } = normalizeItem(baseItem, baseFeed, baseFeed.feedUrl!, "2024-01-15T10:00:00.000Z");
    expect(internal.contentText).not.toContain("<p>");
    expect(internal.contentText).not.toContain("<strong>");
    expect(internal.contentText).toContain("Hello");
    expect(internal.contentText).toContain("world");
  });

  it("preserves contentHtml as raw HTML", () => {
    const { internal } = normalizeItem(baseItem, baseFeed, baseFeed.feedUrl!, "2024-01-15T10:00:00.000Z");
    expect(internal.contentHtml).toBe(baseItem.content);
  });

  it("sets hasFullContent to true when content is present", () => {
    const { internal } = normalizeItem(baseItem, baseFeed, baseFeed.feedUrl!, "2024-01-15T10:00:00.000Z");
    expect(internal.hasFullContent).toBe(true);
  });

  it("sets hasFullContent to false when no content", () => {
    const itemNoContent: ParsedItem = { ...baseItem, content: undefined, contentEncoded: undefined };
    const { internal } = normalizeItem(itemNoContent, baseFeed, baseFeed.feedUrl!, "2024-01-15T10:00:00.000Z");
    expect(internal.hasFullContent).toBe(false);
    expect(internal.contentText).toBeNull();
    expect(internal.contentHtml).toBeNull();
  });

  it("uses isoDate for publishedAt when available", () => {
    const { internal } = normalizeItem(baseItem, baseFeed, baseFeed.feedUrl!, "2024-01-15T10:00:00.000Z");
    expect(internal.publishedAt).toBe("2024-01-15T10:00:00.000Z");
  });

  it("falls back to pubDate when isoDate is absent", () => {
    const itemWithPubDate: ParsedItem = { ...baseItem, isoDate: undefined, pubDate: "Mon, 15 Jan 2024 10:00:00 GMT" };
    const { internal } = normalizeItem(itemWithPubDate, baseFeed, baseFeed.feedUrl!, "2024-01-15T10:00:00.000Z");
    expect(internal.publishedAt).toBeTruthy();
  });

  it("generates stable IDs from guid", () => {
    const { internal: item1 } = normalizeItem(baseItem, baseFeed, baseFeed.feedUrl!, "2024-01-15T10:00:00.000Z");
    const { internal: item2 } = normalizeItem(baseItem, baseFeed, baseFeed.feedUrl!, "2024-01-16T10:00:00.000Z");
    expect(item1.id).toBe(item2.id);
  });

  it("handles nested HTML tags in contentEncoded", () => {
    const itemWithEncoded: ParsedItem = {
      ...baseItem,
      contentEncoded: "<div><h1>Title</h1><p>Content with <a href='#'>link</a></p></div>",
    };
    const { internal } = normalizeItem(itemWithEncoded, baseFeed, baseFeed.feedUrl!, "2024-01-15T10:00:00.000Z");
    expect(internal.contentText).not.toContain("<div>");
    expect(internal.contentText).toContain("Title");
    expect(internal.contentText).toContain("Content with");
    expect(internal.contentText).toContain("link");
  });
});

describe("normalizeFeed", () => {
  it("normalizes all items in a feed", () => {
    const feed: ParsedFeed = {
      ...baseFeed,
      items: [baseItem, { ...baseItem, guid: "item-2", title: "Article 2" }],
    };
    const pairs = normalizeFeed(feed, feed.feedUrl!);
    expect(pairs).toHaveLength(2);
  });

  it("sets sourceUrl on each item", () => {
    const feed: ParsedFeed = { ...baseFeed, items: [baseItem] };
    const pairs = normalizeFeed(feed, "https://custom.example.com/feed.rss");
    expect(pairs[0].internal.sourceUrl).toBe("https://custom.example.com/feed.rss");
  });
});
