import { describe, it, expect } from "vitest";
import { matchesSearch } from "../../query/search.js";
import type { FeedItem } from "../../types.js";

function makeItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    id: "test-1",
    sourceName: "Feed",
    sourceUrl: "https://example.com",
    title: "OpenAI releases new model GPT-5",
    link: "https://example.com/article",
    author: "Reporter",
    publishedAt: "2024-01-01T00:00:00.000Z",
    updatedAt: null,
    summary: "A breakthrough in artificial intelligence with a new language model.",
    contentText: "The full article discusses machine learning advancements.",
    contentHtml: null,
    categories: [],
    language: "en",
    guid: "g1",
    fetchedAt: "2024-01-01T01:00:00.000Z",
    contentHash: "h1",
    hasFullContent: true,
    ...overrides,
  };
}

describe("matchesSearch", () => {
  it("matches a plain term present in title", () => {
    expect(matchesSearch(makeItem(), "OpenAI")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(matchesSearch(makeItem(), "openai")).toBe(true);
    expect(matchesSearch(makeItem(), "OPENAI")).toBe(true);
  });

  it("fails when term is not present", () => {
    expect(matchesSearch(makeItem(), "Anthropic")).toBe(false);
  });

  it("AND logic: all plain terms must match", () => {
    expect(matchesSearch(makeItem(), "OpenAI GPT-5")).toBe(true);
    expect(matchesSearch(makeItem(), "OpenAI Anthropic")).toBe(false);
  });

  it("matches quoted phrase", () => {
    expect(matchesSearch(makeItem(), '"artificial intelligence"')).toBe(true);
    expect(matchesSearch(makeItem(), '"quantum computing"')).toBe(false);
  });

  it("OR logic: either side must match", () => {
    expect(matchesSearch(makeItem(), "OpenAI OR Anthropic")).toBe(true);
    expect(matchesSearch(makeItem(), "Google OR Anthropic")).toBe(false);
  });

  it("NOT term: excluded term must not be present", () => {
    expect(matchesSearch(makeItem(), "-Anthropic")).toBe(true);
    expect(matchesSearch(makeItem(), "-OpenAI")).toBe(false);
  });

  it("searches across title, summary, and contentText", () => {
    expect(matchesSearch(makeItem(), "machine learning")).toBe(true);
    expect(matchesSearch(makeItem(), "breakthrough")).toBe(true);
  });

  it("returns true for empty query", () => {
    expect(matchesSearch(makeItem(), "")).toBe(true);
    expect(matchesSearch(makeItem(), "  ")).toBe(true);
  });
});
