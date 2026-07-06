import { describe, it, expect } from "vitest";
import { ingestOpenWikiTree, wikiPathFor } from "../../ingestion/openwiki.js";

const FIXTURE_ROOT = new URL("../../../examples/fixtures/openwiki-sample", import.meta.url).pathname;

describe("wikiPathFor", () => {
  it("collapses index/README landing pages into their folder", () => {
    expect(wikiPathFor("guides/getting-started/index.md")).toEqual(["guides", "getting-started"]);
    expect(wikiPathFor("guides/README.md")).toEqual(["guides"]);
  });

  it("keeps the root index page as an empty (home) path", () => {
    expect(wikiPathFor("index.md")).toEqual([]);
  });

  it("leaves non-landing pages as their full path", () => {
    expect(wikiPathFor("guides/getting-started/troubleshooting.md")).toEqual([
      "guides",
      "getting-started",
      "troubleshooting",
    ]);
  });
});

describe("ingestOpenWikiTree", () => {
  it("preserves wiki section structure as chunk metadata", async () => {
    const chunks = await ingestOpenWikiTree({ rootDir: FIXTURE_ROOT });
    expect(chunks.every((c) => c.sourceType === "openwiki")).toBe(true);

    const homeChunk = chunks.find((c) => c.path === "index.md");
    expect(homeChunk?.breadcrumb).toBe("Home");

    const gettingStarted = chunks.filter((c) => c.path === "guides/getting-started/index.md");
    expect(gettingStarted[0]?.breadcrumb).toBe("Guides > Getting Started");

    const troubleshooting = chunks.filter((c) => c.path === "guides/getting-started/troubleshooting.md");
    expect(troubleshooting[0]?.breadcrumb).toBe("Guides > Getting Started > Troubleshooting");
  });
});
