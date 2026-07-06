import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { humanizeSegment, ingestMarkdownTree, pathSegments, splitIntoSections } from "../../ingestion/markdown.js";

const FIXTURE_ROOT = fileURLToPath(new URL("../../../examples/fixtures/openwiki-sample", import.meta.url));

describe("humanizeSegment", () => {
  it("title-cases kebab and snake case segments", () => {
    expect(humanizeSegment("getting-started")).toBe("Getting Started");
    expect(humanizeSegment("api_reference")).toBe("Api Reference");
    expect(humanizeSegment("index")).toBe("Index");
  });
});

describe("pathSegments", () => {
  it("strips the extension and splits on path separators", () => {
    expect(pathSegments("guides/getting-started/index.md")).toEqual([
      "guides",
      "getting-started",
      "index",
    ]);
  });
});

describe("splitIntoSections", () => {
  it("splits a document into heading-bounded sections with a heading trail", () => {
    const body = [
      "Intro text before any heading.",
      "",
      "# Top",
      "Top-level content.",
      "",
      "## Child",
      "Child content.",
      "",
      "### Grandchild",
      "Grandchild content.",
      "",
      "## Second Child",
      "Second child content.",
    ].join("\n");

    const sections = splitIntoSections(body);

    expect(sections[0]).toMatchObject({ heading: "", headingLevel: 0, content: "Intro text before any heading." });
    expect(sections[1]).toMatchObject({ heading: "Top", headingLevel: 1, headingTrail: [] });
    expect(sections[2]).toMatchObject({ heading: "Child", headingLevel: 2, headingTrail: ["Top"] });
    expect(sections[3]).toMatchObject({
      heading: "Grandchild",
      headingLevel: 3,
      headingTrail: ["Top", "Child"],
    });
    // A sibling heading pops the deeper trail entry back off.
    expect(sections[4]).toMatchObject({
      heading: "Second Child",
      headingLevel: 2,
      headingTrail: ["Top"],
    });
  });

  it("drops an empty leading section when the doc starts with a heading", () => {
    const sections = splitIntoSections("# Title\nBody.");
    expect(sections).toHaveLength(1);
    expect(sections[0]?.heading).toBe("Title");
  });
});

describe("ingestMarkdownTree", () => {
  it("walks a directory tree and chunks every markdown file by heading", async () => {
    const chunks = await ingestMarkdownTree({ rootDir: FIXTURE_ROOT });

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.every((c) => c.sourceType === "markdown-tree")).toBe(true);

    const troubleshooting = chunks.filter((c) => c.path === "guides/getting-started/troubleshooting.md");
    expect(troubleshooting.length).toBeGreaterThanOrEqual(2);
    expect(troubleshooting.every((c) => c.title === "Troubleshooting")).toBe(true);
    expect(troubleshooting.some((c) => c.heading === "Import errors")).toBe(true);
    expect(troubleshooting.some((c) => c.tags.includes("setup"))).toBe(true);
  });

  it("derives titles from frontmatter, falling back to filename", async () => {
    const chunks = await ingestMarkdownTree({ rootDir: FIXTURE_ROOT });
    const home = chunks.find((c) => c.path === "index.md");
    expect(home?.title).toBe("Sample Wiki Home");
  });
});
