import { describe, it, expect, afterAll } from "vitest";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fetchFeedSource } from "../../ingestion/fetcher.js";

const SAMPLE_XML = `<?xml version="1.0"?><rss version="2.0"><channel><title>Test</title></channel></rss>`;

let tmpDir: string;

describe("fetchFeedSource", () => {
  afterAll(async () => {
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
  });

  it("reads a file:// URI", async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "rss2mcp-test-"));
    const filePath = join(tmpDir, "feed.xml");
    await writeFile(filePath, SAMPLE_XML, "utf-8");

    const result = await fetchFeedSource(`file://${filePath}`);
    expect(result).toBe(SAMPLE_XML);
  });

  it("reads an absolute file path", async () => {
    tmpDir ??= await mkdtemp(join(tmpdir(), "rss2mcp-test-"));
    const filePath = join(tmpDir, "feed2.xml");
    await writeFile(filePath, SAMPLE_XML, "utf-8");

    const result = await fetchFeedSource(filePath);
    expect(result).toBe(SAMPLE_XML);
  });

  it("throws on non-existent file", async () => {
    await expect(fetchFeedSource("/nonexistent/path/feed.xml")).rejects.toThrow();
  });

  it("throws on invalid HTTP URL (unreachable)", async () => {
    await expect(
      fetchFeedSource("http://localhost:1/feed.xml"),
    ).rejects.toThrow();
  }, 5000);

  it("handles file with unicode content", async () => {
    tmpDir ??= await mkdtemp(join(tmpdir(), "rss2mcp-test-"));
    const content = `<?xml version="1.0" encoding="UTF-8"?><rss><channel><title>Unicode: 日本語</title></channel></rss>`;
    const filePath = join(tmpDir, "unicode-feed.xml");
    await writeFile(filePath, content, "utf-8");

    const result = await fetchFeedSource(filePath);
    expect(result).toContain("日本語");
  });
});
