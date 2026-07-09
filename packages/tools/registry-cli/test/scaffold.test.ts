import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createMcpHost, loadManifestFile, startHttpHost } from "@quickdeployai/mcp-host";
import {
  ScaffoldError,
  buildImporterScaffoldFiles,
  buildScaffoldManifest,
  writeImporterScaffold,
  writeScaffoldManifest,
} from "../src/scaffold";

async function fixtureRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), "registry-cli-scaffold-"));
}

describe("buildScaffoldManifest", () => {
  it("normalizes a bare name and produces a schema-valid requests manifest", () => {
    const manifest = buildScaffoldManifest({
      importer: "openapi-2-mcp",
      name: "widgets",
      sourceType: "http",
      sourceUri: "https://widgets.example/openapi.json",
      requests: [{ method: "get", uriTemplate: "/widgets/{id}" }],
      auth: [{ type: "bearer", env: "WIDGETS_API_TOKEN" }],
    });

    expect(manifest.metadata.name).toBe("ai.quickdeploy/widgets");
    expect(manifest.metadata.version).toBe("0.1.0");
    expect(manifest.spec.select.requests).toEqual([
      { method: "GET", uriTemplate: "/widgets/{id}" },
    ]);
    expect(manifest.spec.auth).toEqual([
      { type: "bearer", valueFrom: { env: "WIDGETS_API_TOKEN" } },
    ]);
    expect(manifest.deployment).toMatchObject({
      transport: "streamable-http",
      auth: { type: "none" },
    });
  });

  it("keeps an already-namespaced name as-is", () => {
    const manifest = buildScaffoldManifest({
      importer: "knowledge-2-mcp",
      name: "ai.quickdeploy/docs-corpus",
      sourceType: "http",
      sourceUri: "https://docs.example/llms.txt",
      corpusGlobs: ["/docs/**"],
    });
    expect(manifest.metadata.name).toBe("ai.quickdeploy/docs-corpus");
  });

  it("builds a skills selection with globs", () => {
    const manifest = buildScaffoldManifest({
      importer: "agent-skills-2-mcp",
      name: "skills-demo",
      sourceType: "git",
      sourceUri: "git+https://github.com/example/skills.git",
      sourceRef: "main",
      skills: [{ name: "demo-skill", globs: ["demo-skill/**"] }],
    });
    expect(manifest.spec.select.skills).toEqual([{ name: "demo-skill", globs: ["demo-skill/**"] }]);
    expect(manifest.spec.source).toMatchObject({ type: "git", ref: "main" });
  });

  it("builds a grpc selection", () => {
    const manifest = buildScaffoldManifest({
      importer: "grpc-2-mcp",
      name: "grpc-demo",
      sourceType: "file",
      sourceUri: "file://packages/importers/grpc-2-mcp/fixtures/greeter.binpb",
      grpcMethods: [{ service: "demo.Greeter", method: "SayHello" }],
    });
    expect(manifest.spec.select.grpcMethods).toEqual([
      { service: "demo.Greeter", method: "SayHello" },
    ]);
  });

  it("applies expose renames and deny entries", () => {
    const manifest = buildScaffoldManifest({
      importer: "openapi-2-mcp",
      name: "widgets",
      sourceType: "http",
      sourceUri: "https://widgets.example/openapi.json",
      requests: [{ method: "get", uriTemplate: "/widgets/{id}" }],
      exposeTools: [{ from: "GET /widgets/{id}", name: "get_widget" }],
      denyTools: [{ from: "GET /internal", reason: "internal-only" }],
    });
    expect(manifest.spec.expose.tools).toEqual([
      { from: "GET /widgets/{id}", name: "get_widget", deny: false },
      { from: "GET /internal", deny: true, reason: "internal-only" },
    ]);
  });

  it("rejects a manifest with no selection", () => {
    expect(() =>
      buildScaffoldManifest({
        importer: "openapi-2-mcp",
        name: "widgets",
        sourceType: "http",
        sourceUri: "https://widgets.example/openapi.json",
      }),
    ).toThrow(ScaffoldError);
  });

  it("rejects an invalid source uri via schema validation", () => {
    expect(() =>
      buildScaffoldManifest({
        importer: "openapi-2-mcp",
        name: "widgets",
        sourceType: "http",
        sourceUri: "not-a-uri",
        requests: [{ method: "get", uriTemplate: "/widgets" }],
      }),
    ).toThrow();
  });
});

describe("writeScaffoldManifest", () => {
  it("writes a YAML manifest that round-trips and validates against the registered importer config schema", async () => {
    const rootDir = await fixtureRoot();
    const result = await writeScaffoldManifest({
      rootDir,
      importer: "openapi-2-mcp",
      name: "widgets",
      sourceType: "http",
      sourceUri: "https://widgets.example/openapi.json",
      requests: [{ method: "get", uriTemplate: "/widgets/{id}" }],
      configSchema: { type: "object", properties: { baseUrl: { type: "string" } } },
      configDefaults: { baseUrl: "https://widgets.example" },
    });

    expect(result.path).toBe(join(rootDir, "registry", "quickdeploy", "widgets.mcp.yaml"));
    const onDisk = await readFile(result.path, "utf8");
    expect(onDisk).toContain("ai.quickdeploy/widgets");

    const loaded = await loadManifestFile(result.path);
    expect(loaded.metadata.name).toBe("ai.quickdeploy/widgets");
  });

  it("rejects a config schema field the importer does not support", async () => {
    const rootDir = await fixtureRoot();
    await expect(
      writeScaffoldManifest({
        rootDir,
        importer: "openapi-2-mcp",
        name: "widgets",
        sourceType: "http",
        sourceUri: "https://widgets.example/openapi.json",
        requests: [{ method: "get", uriTemplate: "/widgets/{id}" }],
        configSchema: { type: "object", properties: { notARealField: { type: "string" } } },
      }),
    ).rejects.toThrow(/not supported/);
  });

  it("produces a manifest that mcp-host resolves and serves over streamable HTTP", async () => {
    const rootDir = await fixtureRoot();
    const result = await writeScaffoldManifest({
      rootDir,
      importer: "openapi-2-mcp",
      name: "scaffold-e2e",
      sourceType: "http",
      sourceUri: "https://scaffold-e2e.example/openapi.json",
      requests: [{ method: "get", uriTemplate: "/items/{id}" }],
    });

    const host = createMcpHost({ manifest: result.manifest });
    const http = await startHttpHost(host);
    try {
      const ready = await fetch(`${http.url}/readyz`).then((res) => res.json());
      expect(ready).toMatchObject({ ok: true, server: "ai.quickdeploy/scaffold-e2e" });

      const body = await postRpc(http.url, { jsonrpc: "2.0", id: "tools", method: "tools/list" });
      expect(body.result.tools.map((tool: { name: string }) => tool.name)).toEqual([
        "get_items_id",
      ]);
    } finally {
      await http.close();
    }
  });
});

async function postRpc(url: string, body: unknown): Promise<any> {
  const response = await fetch(`${url}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return response.json();
}

describe("buildImporterScaffoldFiles", () => {
  it("generates a package that follows the pure-library importer convention", () => {
    const files = buildImporterScaffoldFiles({ name: "widgets-2-mcp" });
    const byPath = new Map(files.map((file) => [file.path, file.content]));

    const packageJson = JSON.parse(
      byPath.get("packages/importers/widgets-2-mcp/package.json")!,
    );
    expect(packageJson.name).toBe("@quickdeployai/widgets-2-mcp");
    expect(packageJson.dependencies).toMatchObject({
      "@quickdeployai/importer-core": "workspace:*",
    });
    expect(packageJson.scripts).toMatchObject({ typecheck: "tsc --noEmit", test: "vitest run" });

    const indexTs = byPath.get("packages/importers/widgets-2-mcp/src/index.ts")!;
    expect(indexTs).toContain("buildWidgets2McpTools");
    expect(indexTs).toContain("@quickdeployai/importer-core/auth");

    const indexTest = byPath.get("packages/importers/widgets-2-mcp/src/index.test.ts")!;
    expect(indexTest).toContain("WIDGETS_2_MCP_TOKEN");
  });

  it("rejects an invalid package name", () => {
    expect(() => buildImporterScaffoldFiles({ name: "Widgets 2 MCP" })).toThrow(ScaffoldError);
  });
});

describe("writeImporterScaffold", () => {
  it("writes every generated file under packages/importers/<name>", async () => {
    const rootDir = await fixtureRoot();
    const result = await writeImporterScaffold({ rootDir, name: "widgets-2-mcp" });

    expect(result.dir).toBe(join(rootDir, "packages", "importers", "widgets-2-mcp"));
    expect(result.files).toEqual(
      expect.arrayContaining([
        join("packages", "importers", "widgets-2-mcp", "package.json"),
        join("packages", "importers", "widgets-2-mcp", "src", "index.ts"),
        join("packages", "importers", "widgets-2-mcp", "src", "index.test.ts"),
      ]),
    );

    const packageJson = JSON.parse(await readFile(join(result.dir, "package.json"), "utf8"));
    expect(packageJson.name).toBe("@quickdeployai/widgets-2-mcp");
  });

  it("refuses to overwrite an existing scaffold without --force", async () => {
    const rootDir = await fixtureRoot();
    await writeImporterScaffold({ rootDir, name: "widgets-2-mcp" });
    await expect(writeImporterScaffold({ rootDir, name: "widgets-2-mcp" })).rejects.toThrow(
      ScaffoldError,
    );
    await expect(
      writeImporterScaffold({ rootDir, name: "widgets-2-mcp", force: true }),
    ).resolves.toMatchObject({ dir: join(rootDir, "packages", "importers", "widgets-2-mcp") });
  });
});
