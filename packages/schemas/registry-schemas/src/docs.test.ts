import { describe, expect, it } from "vitest";
import {
  CAPABILITY_CATEGORY_TYPES,
  CAPABILITY_TYPE_LABELS,
  CapabilityCategorySchema,
  CapabilityTypeSchema,
  getCapabilityCategory,
  resolveCapabilityFilterTypes,
} from "./capability";
import {
  DEFAULT_EMBEDDING_DIMS,
  DEFAULT_EMBEDDING_MODEL,
  DEFAULT_RETRIEVAL_TOP_K,
  DocsManifestSchema,
} from "./docs";

describe("docs capability taxonomy", () => {
  it("registers `docs` as a capability type and category", () => {
    expect(CapabilityTypeSchema.options).toContain("docs");
    expect(CapabilityCategorySchema.options).toContain("docs");
  });

  it("maps the `docs` category to the `docs` type with a label", () => {
    expect(CAPABILITY_CATEGORY_TYPES.docs).toEqual(["docs"]);
    expect(getCapabilityCategory("docs")).toBe("docs");
    expect(CAPABILITY_TYPE_LABELS.docs).toBe("Docs & Knowledge");
  });

  it("resolves `docs` filters to the docs type", () => {
    expect(resolveCapabilityFilterTypes("docs")).toEqual(["docs"]);
    expect(resolveCapabilityFilterTypes("all")).toContain("docs");
  });
});

describe("DocsManifestSchema", () => {
  const minimal = {
    kind: "docs" as const,
    name: "Company Handbook",
    sources: [{ kind: "file-upload" as const }],
  };

  it("accepts a minimal manifest and applies defaults (Supabase vector by default)", () => {
    const parsed = DocsManifestSchema.parse(minimal);
    expect(parsed.format).toBe("mixed");
    expect(parsed.retrieval.strategy).toBe("vector");
    expect(parsed.retrieval.topK).toBe(DEFAULT_RETRIEVAL_TOP_K);
    expect(parsed.vectorStore.kind).toBe("supabase");
    expect(parsed.embedding.model).toBe(DEFAULT_EMBEDDING_MODEL);
    expect(parsed.embedding.dims).toBe(DEFAULT_EMBEDDING_DIMS);
    expect(parsed.serving).toEqual({ mcp: true, rest: true });
    expect(parsed.sources[0]?.config).toEqual({});
  });

  it("accepts a fully-specified manifest across connectors + vector stores", () => {
    const parsed = DocsManifestSchema.parse({
      ...minimal,
      description: "Internal docs",
      publisher: "Acme",
      version: "1.0.0",
      format: "mixed",
      sources: [
        { kind: "markdown-tree", config: { include: ["docs/**/*.md"] } },
        { kind: "llms-txt", config: { llmsTxtUrl: "https://acme.example/llms.txt" } },
        { kind: "bounded-crawl", config: { startUrl: "https://acme.example/docs" } },
        { kind: "url", config: { url: "https://acme.example/docs" } },
        { kind: "okf", config: { repo: "acme/knowledge" } },
        { kind: "google-drive", config: { credential_ref: "keyvault:gdrive" } },
        { kind: "sharepoint", config: { credential_ref: "keyvault:spo" } },
      ],
      retrieval: { strategy: "lexical", topK: 12 },
      vectorStore: { kind: "upstash", configRef: "keyvault:upstash" },
      embedding: { model: "text-embedding-3-large", dims: 3072 },
      serving: { mcp: true, rest: false },
    });
    expect(parsed.retrieval.strategy).toBe("lexical");
    expect(parsed.vectorStore.kind).toBe("upstash");
    expect(parsed.serving.rest).toBe(false);
  });

  it("rejects a manifest with no sources", () => {
    expect(() => DocsManifestSchema.parse({ ...minimal, sources: [] })).toThrow();
  });

  it("rejects an unknown vector store kind", () => {
    expect(() =>
      DocsManifestSchema.parse({
        ...minimal,
        vectorStore: { kind: "weaviate" },
      }),
    ).toThrow();
  });

  it("rejects the wrong capability kind", () => {
    expect(() => DocsManifestSchema.parse({ ...minimal, kind: "mcp" })).toThrow();
  });
});
