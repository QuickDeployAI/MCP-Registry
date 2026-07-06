/**
 * Markdown-tree ingestion adapter.
 *
 * Walks a directory of `.md`/`.markdown` files and splits each into
 * heading-bounded chunks. Source-format neutral: this is the adapter every
 * other knowledge-2-mcp ingestion mode (OpenWiki output, OKF bundles, plain
 * doc sites) builds on.
 */
import { readFile } from "node:fs/promises";
import { extname, relative, sep } from "node:path";
import fg from "fast-glob";
import matter from "gray-matter";
import type { DocChunk } from "../types.js";

const HEADING_RE = /^(#{1,6})\s+(.*)$/;

export interface MarkdownTreeOptions {
  /** Root directory to walk. */
  rootDir: string;
  /** Glob patterns to include, relative to rootDir. Defaults to all markdown files. */
  include?: string[];
  /** Glob patterns to exclude, relative to rootDir. */
  exclude?: string[];
}

/** Humanize a path segment: "getting-started" / "getting_started" -> "Getting Started". */
export function humanizeSegment(segment: string): string {
  return segment
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Split a relative file path into extension-less segments, POSIX-normalized. */
export function pathSegments(relativePath: string): string[] {
  const withoutExt = relativePath.slice(0, relativePath.length - extname(relativePath).length);
  return withoutExt.split(sep).filter(Boolean);
}

interface RawSection {
  heading: string;
  headingLevel: number;
  headingTrail: string[];
  content: string;
}

/** Split a markdown document body into heading-bounded sections. */
export function splitIntoSections(body: string): RawSection[] {
  const lines = body.split(/\r?\n/);
  const sections: RawSection[] = [];
  const trailStack: { level: number; title: string }[] = [];

  let current: RawSection = { heading: "", headingLevel: 0, headingTrail: [], content: "" };
  let buffer: string[] = [];

  const flush = () => {
    const content = buffer.join("\n").trim();
    if (content.length > 0 || current.heading) {
      sections.push({ ...current, content });
    }
    buffer = [];
  };

  for (const line of lines) {
    const match = HEADING_RE.exec(line);
    if (!match) {
      buffer.push(line);
      continue;
    }

    flush();

    const level = match[1]!.length;
    const title = match[2]!.trim();
    while (trailStack.length > 0 && trailStack[trailStack.length - 1]!.level >= level) {
      trailStack.pop();
    }
    const headingTrail = trailStack.map((t) => t.title);
    trailStack.push({ level, title });

    current = { heading: title, headingLevel: level, headingTrail, content: "" };
  }
  flush();

  return sections.filter((s) => s.content.length > 0 || s.heading.length > 0);
}

function deriveTitle(frontmatterTitle: unknown, sections: RawSection[], fallback: string): string {
  if (typeof frontmatterTitle === "string" && frontmatterTitle.trim()) return frontmatterTitle.trim();
  const firstHeading = sections.find((s) => s.headingLevel === 1 || s.headingLevel === 0 && s.heading);
  if (firstHeading?.heading) return firstHeading.heading;
  return fallback;
}

function normalizeTags(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

/**
 * Ingest a markdown tree into a flat list of DocChunk records.
 * `wikiPath` here is purely structural (file path segments); ingestion
 * modes with wiki-specific semantics (e.g. OpenWiki) post-process it.
 */
export async function ingestMarkdownTree(opts: MarkdownTreeOptions): Promise<DocChunk[]> {
  const include = opts.include ?? ["**/*.md", "**/*.markdown"];
  const exclude = opts.exclude ?? [];

  const files = await fg(include, {
    cwd: opts.rootDir,
    ignore: exclude,
    onlyFiles: true,
    dot: false,
  });

  const chunks: DocChunk[] = [];

  for (const relPath of files.sort()) {
    const absPath = `${opts.rootDir}/${relPath}`;
    const raw = await readFile(absPath, "utf-8");
    const parsed = matter(raw);
    const segments = pathSegments(relative(".", relPath));
    const fallbackTitle = humanizeSegment(segments[segments.length - 1] ?? relPath);
    const sections = splitIntoSections(parsed.content);
    const title = deriveTitle(parsed.data.title, sections, fallbackTitle);
    const tags = normalizeTags(parsed.data.tags);

    for (const section of sections) {
      chunks.push({
        path: relPath,
        wikiPath: segments,
        breadcrumb: segments.map(humanizeSegment).join(" > "),
        title,
        heading: section.heading,
        headingLevel: section.headingLevel,
        headingTrail: section.headingTrail,
        content: section.content,
        tags,
        sourceType: "markdown-tree",
      });
    }
  }

  return chunks;
}
