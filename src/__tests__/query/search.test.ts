import { describe, it, expect } from "vitest";
import { matchesSearch } from "../../query/search.js";

function makeItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    _id: "test-1",
    title: "OpenAI releases new model GPT-5",
    link: "https://example.com/article",
    pubDate: "2024-01-01T00:00:00.000Z",
    description: "A breakthrough in artificial intelligence with a new language model.",
    contentText: "The full article discusses machine learning advancements.",
    guid: { value: "g1" },
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

  it("searches across all string fields", () => {
    expect(matchesSearch(makeItem(), "machine learning")).toBe(true);
    expect(matchesSearch(makeItem(), "breakthrough")).toBe(true);
  });

  it("returns true for empty query", () => {
    expect(matchesSearch(makeItem(), "")).toBe(true);
    expect(matchesSearch(makeItem(), "  ")).toBe(true);
  });
});
