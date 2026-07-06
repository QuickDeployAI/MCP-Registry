/**
 * End-to-end recipe test: ingest the sample OpenWiki fixture tree, then
 * search and retrieve a doc, asserting the citation is correct — this is
 * QUI-225's acceptance criterion in executable form.
 */
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MemoryStore } from "@quickdeployai/corpus-core";
import type { StoreAdapter } from "@quickdeployai/corpus-core";
import { RefreshCorpusUseCase } from "../../application/refresh-corpus.use-case.js";
import { SearchCorpusUseCase } from "../../application/search-corpus.use-case.js";
import { GetDocUseCase } from "../../application/get-doc.use-case.js";
import { ListSourcesUseCase } from "../../application/list-sources.use-case.js";
import type { DocChunk } from "../../types.js";

const FIXTURE_ROOT = fileURLToPath(new URL("../../../examples/fixtures/openwiki-sample", import.meta.url));
const CORPUS_ID = "sample-openwiki";

function isError(value: unknown): value is { error: string } {
  return typeof value === "object" && value !== null && "error" in value;
}

describe("OpenWiki recipe: ingest -> search -> get_doc", () => {
  const store: StoreAdapter<DocChunk> = new MemoryStore(1000) as unknown as StoreAdapter<DocChunk>;

  beforeAll(async () => {
    const result = await new RefreshCorpusUseCase(store).execute({
      corpusId: CORPUS_ID,
      sourceDir: FIXTURE_ROOT,
      sourceType: "openwiki",
    });
    if (isError(result)) throw new Error(`fixture ingestion failed: ${result.error}`);
    expect(result.newChunks).toBeGreaterThan(0);
  });

  it("lists sources with discovered sections", async () => {
    const summary = await new ListSourcesUseCase(store).execute(CORPUS_ID);
    if (isError(summary)) throw new Error(summary.error);
    expect(summary.pageCount).toBe(4);
    expect(summary.sections).toContain("guides");
  });

  it("finds a chunk by full-text search with a correct page-level citation", async () => {
    const result = await new SearchCorpusUseCase(store, { maxResults: 20, maxFieldSize: 800 }).execute(
      CORPUS_ID,
      { search: "401 authentication" },
    );
    if (isError(result)) throw new Error(result.error);

    expect(result.hits.length).toBeGreaterThan(0);
    const hit = result.hits[0]!;
    expect(hit.path).toBe("guides/getting-started/troubleshooting.md");
    expect(hit.breadcrumb).toBe("Guides > Getting Started > Troubleshooting");
    expect(hit.heading).toBe("Authentication errors");
    expect(hit.citation).toBe("Guides > Getting Started > Troubleshooting > Authentication errors");
    expect(hit.snippet).toContain("401");
  });

  it("retrieves the full chunk content via get_doc using the search hit id", async () => {
    const search = await new SearchCorpusUseCase(store, { maxResults: 20, maxFieldSize: 800 }).execute(
      CORPUS_ID,
      { search: "install sample-lib" },
    );
    if (isError(search)) throw new Error(search.error);
    const hit = search.hits[0]!;

    const doc = await new GetDocUseCase(store).execute(CORPUS_ID, hit.id);
    if (isError(doc)) throw new Error(doc.error);

    expect(doc.content).toContain("pip install sample-lib");
    expect(doc.citation).toBe(hit.citation);
  });

  it("re-ingesting after a page edit surfaces the change and reports no duplicate chunk explosion for unchanged pages", async () => {
    const dir = await mkdtemp(join(tmpdir(), "knowledge-2-mcp-"));
    try {
      await writeFile(
        join(dir, "page.md"),
        ["---", "title: Live Page", "---", "", "# Live Page", "", "Original content."].join("\n"),
      );

      const localStore: StoreAdapter<DocChunk> = new MemoryStore(1000) as unknown as StoreAdapter<DocChunk>;
      const refresh = new RefreshCorpusUseCase(localStore);

      const first = await refresh.execute({ corpusId: "live", sourceDir: dir, sourceType: "markdown" });
      if (isError(first)) throw new Error(first.error);
      expect(first.newChunks).toBe(1);

      // Re-running with no changes ingests zero new chunks (content-hash dedup).
      const second = await refresh.execute({ corpusId: "live", sourceDir: dir, sourceType: "markdown" });
      if (isError(second)) throw new Error(second.error);
      expect(second.newChunks).toBe(0);

      await writeFile(
        join(dir, "page.md"),
        ["---", "title: Live Page", "---", "", "# Live Page", "", "Updated content after edit."].join("\n"),
      );

      const third = await refresh.execute({ corpusId: "live", sourceDir: dir, sourceType: "markdown" });
      if (isError(third)) throw new Error(third.error);
      expect(third.newChunks).toBe(1);

      const search = await new SearchCorpusUseCase(localStore, { maxResults: 20, maxFieldSize: 800 }).execute(
        "live",
        { search: "updated content" },
      );
      if (isError(search)) throw new Error(search.error);
      expect(search.hits).toHaveLength(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  afterAll(async () => {
    await store.close();
  });
});
