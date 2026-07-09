import { constants } from "node:fs";
import { access, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import {
  buildGeneratedMcpManifest,
  renderGeneratedMcpManifest,
  type GeneratedMcpManifestIntent,
} from "../src/codegen/manifest-generator";
import {
  buildGeneratedMcpCodegenProject,
  writeGeneratedMcpCodegenProject,
} from "../src/codegen/project-generator";

const execFileAsync = promisify(execFile);

const FIXTURE_INTENTS: GeneratedMcpManifestIntent[] = [
  {
    provider: "Acme OpenAPI",
    family: "openapi-2-mcp",
    source: { type: "http", uri: "https://api.example.test/openapi.json" },
    sourceMetadata: { retrievedAt: "2026-07-09", sourceVersion: "2026-07-01" },
    select: { requests: [{ method: "GET", uriTemplate: "/widgets/{id}" }] },
    auth: [{ type: "bearer", valueFrom: { env: "ACME_OPENAPI_TOKEN" } }],
  },
  {
    provider: "Acme Events",
    family: "asyncapi-2-mcp",
    capability: "events",
    source: { type: "http", uri: "https://events.example.test/asyncapi.json" },
    sourceMetadata: { retrievedAt: "2026-07-09", sourceVersion: "1.2.0" },
    select: { requests: [{ method: "PUBLISH", uriTemplate: "channel://orders.created" }] },
    auth: [
      { type: "api-key", in: "header", name: "x-api-key", valueFrom: { env: "ACME_EVENTS_KEY" } },
    ],
  },
  {
    provider: "Acme Greeter",
    family: "grpc-2-mcp",
    source: { type: "file", uri: "file://fixtures/acme-greeter.binpb" },
    sourceMetadata: { retrievedAt: "2026-07-09", sourceVersion: "sha256:test-descriptor" },
    select: { grpcMethods: [{ service: "acme.greeter.Greeter", method: "SayHello" }] },
    auth: [{ type: "bearer", valueFrom: { env: "ACME_GRPC_TOKEN" } }],
  },
  {
    provider: "Acme SOAP",
    family: "wsdl-2-mcp",
    source: { type: "http", uri: "https://soap.example.test/service.wsdl" },
    sourceMetadata: { retrievedAt: "2026-07-09", sourceVersion: "service-v3" },
    select: { requests: [{ method: "SOAP", uriTemplate: "Calculator/Add" }] },
    auth: [
      {
        type: "basic",
        usernameFrom: { env: "ACME_SOAP_USERNAME" },
        passwordFrom: { env: "ACME_SOAP_PASSWORD" },
      },
    ],
  },
  {
    provider: "Acme Feed",
    family: "feed-2-mcp",
    source: { type: "http", uri: "https://feeds.example.test/releases.xml" },
    sourceMetadata: { retrievedAt: "2026-07-09", sourceVersion: "rss" },
    select: { corpusGlobs: ["/releases/**"] },
    auth: [],
  },
];

const IMPORTER_PACKAGE_BY_FAMILY = {
  openapi: "@quickdeployai/openapi-2-mcp",
  asyncapi: "@quickdeployai/asyncapi-2-mcp",
  grpc: "@quickdeployai/grpc-2-mcp",
  wsdl: "@quickdeployai/wsdl-2-mcp",
  feed: "@quickdeployai/feed-2-mcp",
} as const;

describe("generated MCP codegen project generator", () => {
  it.each(FIXTURE_INTENTS)("builds a gitignored project layout for $family", (intent) => {
    const manifestResult = buildGeneratedMcpManifest(intent);
    const project = buildGeneratedMcpCodegenProject({
      rootDir: "/repo",
      ...manifestResult,
    });
    const files = new Map(project.files.map((file) => [file.path, file.contents]));
    const importerPackage = IMPORTER_PACKAGE_BY_FAMILY[manifestResult.family];

    expect(project.projectPath).toBe(
      `.generated/mcp-codegen/${manifestResult.family}/${manifestResult.provider}/`,
    );
    expect(project.absoluteProjectPath).toBe(
      join("/repo", ".generated", "mcp-codegen", manifestResult.family, manifestResult.provider),
    );
    expect([...files.keys()].sort()).toEqual([
      "README.md",
      "manifest.mcp.json",
      "package.json",
      "runtime-policy.json",
      "source-metadata.json",
      "src/index.ts",
      "test/generated-project.test.ts",
      "tsconfig.json",
    ]);

    const packageJson = JSON.parse(files.get("package.json") ?? "{}") as {
      name?: string;
      private?: boolean;
      scripts?: Record<string, string>;
      dependencies?: Record<string, string>;
    };
    expect(packageJson.name).toBe(
      `@quickdeployai/generated-mcp-${manifestResult.family}-${manifestResult.provider}`,
    );
    expect(packageJson.private).toBe(true);
    expect(packageJson.scripts).toMatchObject({
      build: "tsc -p tsconfig.json --noEmit",
      test: "vitest run --testTimeout=30000 test/generated-project.test.ts",
    });
    expect(packageJson.dependencies).toMatchObject({
      "@quickdeployai/mcp-host": "workspace:*",
      "@quickdeployai/registry-schemas": "workspace:*",
      [importerPackage]: "workspace:*",
    });

    expect(files.get("manifest.mcp.json")).toBe(renderGeneratedMcpManifest(manifestResult.manifest));
    expect(files.get("README.md")).toContain(project.projectPath);
    expect(files.get("README.md")).toContain("OpenShell/MXC");
    expect(files.get("source-metadata.json")).toContain(intent.source.uri);
    expect(files.get("runtime-policy.json")).toContain("openshell-mxc-only");
    expect(files.get("src/index.ts")).toContain(importerPackage);
    expect(files.get("test/generated-project.test.ts")).toContain("loadGeneratedManifest");
  });

  it("writes only under .generated, stays ignored by git, and preserves artifacts by default", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "generated-mcp-codegen-"));
    await execFileAsync("git", ["init"], { cwd: rootDir });
    await writeFile(join(rootDir, ".gitignore"), ".generated/\n", "utf8");
    const manifestResult = buildGeneratedMcpManifest(FIXTURE_INTENTS[0]);

    const firstWrite = await writeGeneratedMcpCodegenProject({
      rootDir,
      ...manifestResult,
    });
    const debugArtifact = join(firstWrite.absoluteProjectPath, "debug.log");
    await writeFile(debugArtifact, "keep me unless clean is explicit\n", "utf8");

    await writeGeneratedMcpCodegenProject({ rootDir, ...manifestResult });
    await expect(readFile(debugArtifact, "utf8")).resolves.toContain("keep me");

    await writeGeneratedMcpCodegenProject({ rootDir, ...manifestResult, clean: true });
    await expect(access(debugArtifact, constants.F_OK)).rejects.toThrow();

    const { stdout } = await execFileAsync("git", ["status", "--short", "--", ".generated"], {
      cwd: rootDir,
    });
    expect(stdout).toBe("");
  });

  it("can include source fixtures without allowing path traversal", () => {
    const manifestResult = buildGeneratedMcpManifest(FIXTURE_INTENTS[0]);
    const project = buildGeneratedMcpCodegenProject({
      rootDir: "/repo",
      ...manifestResult,
      sourceFixtures: [{ path: "specs/openapi.json", contents: "{\"openapi\":\"3.1.0\"}\n" }],
    });
    const files = new Map(project.files.map((file) => [file.path, file.contents]));

    expect(files.get("fixtures/specs/openapi.json")).toBe("{\"openapi\":\"3.1.0\"}\n");
    expect(() =>
      buildGeneratedMcpCodegenProject({
        rootDir: "/repo",
        ...manifestResult,
        sourceFixtures: [{ path: "../secret.json", contents: "{}" }],
      }),
    ).toThrow(/must stay inside the project/);
  });

  it("does not generate direct host execution entrypoints", () => {
    const manifestResult = buildGeneratedMcpManifest(FIXTURE_INTENTS[0]);
    const project = buildGeneratedMcpCodegenProject({ rootDir: "/repo", ...manifestResult });
    const files = new Map(project.files.map((file) => [file.path, file.contents]));
    const scripts = Object.values(
      JSON.parse(files.get("package.json") ?? "{}").scripts as Record<string, string>,
    ).join("\n");

    for (const file of project.files) {
      expect(file.path).not.toMatch(/^\/|\.\./);
    }
    expect(files.get("src/index.ts")).not.toMatch(/node:child_process|node:vm/);
    expect(scripts).not.toMatch(/\btsx\b|node --import/);
  });
});
