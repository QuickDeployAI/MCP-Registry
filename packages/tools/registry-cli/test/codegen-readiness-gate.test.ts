import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { writeRegistryArtifacts } from "../src/registry-build";
import {
  formatGeneratedMcpReadinessResult,
  validateGeneratedMcpReadiness,
} from "../src/codegen/readiness-gate";
import { writeGeneratedMcpManifest } from "../src/codegen/manifest-generator";
import { writeGeneratedMcpTestFile } from "../src/codegen/test-generator";
import { FIXTURE_GENERATED_MCP_INTENTS } from "./fixtures/generated-mcp-intents";

describe("generated MCP readiness gate", () => {
  it("passes when generated manifests, tests, catalog artifacts, and ignored codegen paths are ready", async () => {
    const rootDir = await fixtureRoot();
    await seedGeneratedProvider(rootDir);
    await writeRegistryArtifacts({ rootDir });

    const result = await validateGeneratedMcpReadiness({ rootDir });

    expect(result.ok).toBe(true);
    expect(result.entries).toEqual([
      {
        provider: "acme-openapi",
        family: "openapi",
        manifestPath: "registry/acme-openapi/api.mcp.json",
        generatedTestPath:
          "packages/tools/registry-cli/test/generated/openapi/acme-openapi.test.ts",
        codegenPath: ".generated/mcp-codegen/openapi/acme-openapi/",
      },
    ]);
    expect(formatGeneratedMcpReadinessResult(result)).toContain("Generated MCP readiness passed");
  });

  it("names provider, family, manifest path, generated test path, and codegen path on failures", async () => {
    const rootDir = await fixtureRoot();
    await seedGeneratedProvider(rootDir);
    await writeRegistryArtifacts({ rootDir });
    await rm(
      join(
        rootDir,
        "packages",
        "tools",
        "registry-cli",
        "test",
        "generated",
        "openapi",
        "acme-openapi.test.ts",
      ),
    );

    const result = await validateGeneratedMcpReadiness({
      rootDir,
      trackedFiles: [".generated/mcp-codegen/openapi/acme-openapi/package.json"],
    });

    expect(result.ok).toBe(false);
    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "missing-generated-test",
          provider: "acme-openapi",
          family: "openapi",
          manifestPath: "registry/acme-openapi/api.mcp.json",
          generatedTestPath:
            "packages/tools/registry-cli/test/generated/openapi/acme-openapi.test.ts",
          codegenPath: ".generated/mcp-codegen/openapi/acme-openapi/",
        }),
        expect.objectContaining({
          code: "tracked-generated-artifact",
          provider: "acme-openapi",
          family: "openapi",
          manifestPath: "registry/acme-openapi/api.mcp.json",
          generatedTestPath:
            "packages/tools/registry-cli/test/generated/openapi/acme-openapi.test.ts",
          codegenPath: ".generated/mcp-codegen/openapi/acme-openapi/package.json",
        }),
      ]),
    );
    expect(formatGeneratedMcpReadinessResult(result)).toContain("provider=acme-openapi");
  });

  it("fails on stale generated catalog output", async () => {
    const rootDir = await fixtureRoot();
    await seedGeneratedProvider(rootDir);
    await writeFile(join(rootDir, "servers.json"), "{}\n", "utf8");

    const result = await validateGeneratedMcpReadiness({ rootDir });

    expect(result.ok).toBe(false);
    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "generated-artifacts-stale",
          provider: "acme-openapi",
          family: "openapi",
          manifestPath: "registry/acme-openapi/api.mcp.json",
          generatedTestPath:
            "packages/tools/registry-cli/test/generated/openapi/acme-openapi.test.ts",
          codegenPath: ".generated/mcp-codegen/openapi/acme-openapi/",
          message: expect.stringContaining("servers.json"),
        }),
      ]),
    );
  });

  it("rejects catalog files that reference gitignored generated projects", async () => {
    const rootDir = await fixtureRoot();
    await seedGeneratedProvider(rootDir);
    await writeRegistryArtifacts({ rootDir });
    const generatedPath = ".generated/mcp-codegen/openapi/acme-openapi/package.json";
    await writeFile(
      join(rootDir, "servers.json"),
      JSON.stringify(
        {
          $schema: "https://quickdeploy.ai/schemas/servers-json.schema.json",
          servers: [
            {
              name: "ai.quickdeploy/acme-openapi",
              packages: [{ registryType: "npm", runtimeArguments: [generatedPath] }],
            },
          ],
        },
        null,
        2,
      ),
      "utf8",
    );
    await writeFile(
      join(rootDir, "registry", "index.json"),
      JSON.stringify(
        {
          schemaVersion: "quickdeploy.mcp-registry/v1",
          providers: [{ id: "acme-openapi", entries: [{ path: generatedPath }] }],
        },
        null,
        2,
      ),
      "utf8",
    );

    const result = await validateGeneratedMcpReadiness({ rootDir });

    expect(result.ok).toBe(false);
    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "catalog-includes-generated-artifact",
          provider: "acme-openapi",
          family: "openapi",
          manifestPath: "registry/acme-openapi/api.mcp.json",
          generatedTestPath:
            "packages/tools/registry-cli/test/generated/openapi/acme-openapi.test.ts",
          codegenPath: ".generated/mcp-codegen/openapi/acme-openapi/",
          message: expect.stringContaining(generatedPath),
        }),
      ]),
    );
  });

  it("rejects codegen source that bypasses the OpenShell/MXC sandbox", async () => {
    const rootDir = await fixtureRoot();
    await seedGeneratedProvider(rootDir);
    await writeRegistryArtifacts({ rootDir });
    const codegenDir = join(rootDir, "packages", "tools", "registry-cli", "src", "codegen");
    await mkdir(codegenDir, { recursive: true });
    await writeFile(join(codegenDir, "bypass.ts"), "export const direct = \"spawn\";\n", "utf8");

    const result = await validateGeneratedMcpReadiness({ rootDir });

    expect(result.ok).toBe(false);
    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "sandbox-bypass",
          provider: "acme-openapi",
          family: "openapi",
          manifestPath: "registry/acme-openapi/api.mcp.json",
          generatedTestPath:
            "packages/tools/registry-cli/test/generated/openapi/acme-openapi.test.ts",
          codegenPath: ".generated/mcp-codegen/openapi/acme-openapi/",
          message: expect.stringContaining("bypass.ts"),
        }),
      ]),
    );
  });
});

async function fixtureRoot(): Promise<string> {
  const rootDir = await mkdtemp(join(tmpdir(), "generated-mcp-readiness-"));
  await writeFile(join(rootDir, ".gitignore"), ".generated/\nregistry/index.json\n", "utf8");
  return rootDir;
}

async function seedGeneratedProvider(rootDir: string): Promise<void> {
  const manifest = await writeGeneratedMcpManifest({
    rootDir,
    intent: FIXTURE_GENERATED_MCP_INTENTS[0],
  });
  const test = await writeGeneratedMcpTestFile({
    rootDir,
    intent: FIXTURE_GENERATED_MCP_INTENTS[0],
  });
  await mkdir(dirname(join(rootDir, test.path)), { recursive: true });
  await mkdir(join(rootDir, ".generated", "mcp-codegen", manifest.family, manifest.provider), {
    recursive: true,
  });
}
