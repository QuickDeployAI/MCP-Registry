import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  formatRegistryValidationViolations,
  validateRegistryEntries,
} from "../src/registry-validate";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

describe("registry-cli validate", () => {
  it("passes with no violations on the seeded repo", async () => {
    const result = await validateRegistryEntries({ rootDir: repoRoot });
    expect(formatRegistryValidationViolations(result.violations)).toBe(
      "Registry validation passed.\n",
    );
    expect(result.ok).toBe(true);
    expect(result.entryCount).toBeGreaterThan(0);
  });

  it("flags an unsupported server.json schema vintage", async () => {
    const rootDir = await fixtureRoot();
    await seedPackageServer(rootDir, {
      $schema: "https://static.modelcontextprotocol.io/schemas/2024-01-01/server.schema.json",
      name: "ai.quickdeploy/bad-vintage",
      version: "1.0.0",
    });

    const result = await validateRegistryEntries({ rootDir });
    expect(result.ok).toBe(false);
    expect(result.violations).toContainEqual(
      expect.objectContaining({ code: "invalid-server-json" }),
    );
  });

  it("flags a malformed name", async () => {
    const rootDir = await fixtureRoot();
    await seedPackageServer(rootDir, {
      name: "not-a-namespaced-name",
      version: "1.0.0",
    });

    const result = await validateRegistryEntries({ rootDir });
    expect(result.ok).toBe(false);
    expect(result.violations).toContainEqual(
      expect.objectContaining({ code: "invalid-name-format", name: "not-a-namespaced-name" }),
    );
  });

  it("flags a QuickDeploy-owned entry outside the ai.quickdeploy namespace", async () => {
    const rootDir = await fixtureRoot();
    await seedPackageServer(rootDir, {
      name: "com.example/not-ours",
      version: "1.0.0",
    });

    const result = await validateRegistryEntries({ rootDir });
    expect(result.ok).toBe(false);
    expect(result.violations).toContainEqual(
      expect.objectContaining({ code: "name-namespace-mismatch", name: "com.example/not-ours" }),
    );
  });

  it("flags a remote-ref entry that squats the ai.quickdeploy namespace", async () => {
    const rootDir = await fixtureRoot();
    await seedRemoteServer(rootDir, {
      name: "ai.quickdeploy/not-a-remote",
      version: "1.0.0",
      remotes: [{ type: "streamable-http", url: "https://mcp.example.com/mcp" }],
    });

    const result = await validateRegistryEntries({ rootDir });
    expect(result.ok).toBe(false);
    expect(result.violations).toContainEqual(
      expect.objectContaining({
        code: "name-namespace-mismatch",
        name: "ai.quickdeploy/not-a-remote",
      }),
    );
  });

  it("flags a non-exact version range", async () => {
    const rootDir = await fixtureRoot();
    await seedPackageServer(rootDir, {
      name: "ai.quickdeploy/ranged",
      version: "^1.0.0",
    });

    const result = await validateRegistryEntries({ rootDir });
    expect(result.ok).toBe(false);
    expect(result.violations).toContainEqual(
      expect.objectContaining({ code: "version-not-exact", name: "ai.quickdeploy/ranged" }),
    );
  });

  it("flags the literal version 'latest'", async () => {
    const rootDir = await fixtureRoot();
    await seedPackageServer(rootDir, {
      name: "ai.quickdeploy/latest-version",
      version: "latest",
    });

    const result = await validateRegistryEntries({ rootDir });
    expect(result.ok).toBe(false);
    expect(result.violations).toContainEqual(
      expect.objectContaining({ code: "version-not-exact", name: "ai.quickdeploy/latest-version" }),
    );
  });

  it("flags duplicate server names across sources", async () => {
    const rootDir = await fixtureRoot();
    await seedPackageServer(rootDir, { name: "ai.quickdeploy/dup", version: "1.0.0" }, "first");
    await seedPackageServer(rootDir, { name: "ai.quickdeploy/dup", version: "2.0.0" }, "second");

    const result = await validateRegistryEntries({ rootDir });
    expect(result.ok).toBe(false);
    expect(result.violations).toContainEqual(
      expect.objectContaining({ code: "duplicate-name", name: "ai.quickdeploy/dup" }),
    );
  });

  it("flags an mcpb package missing fileSha256", async () => {
    const rootDir = await fixtureRoot();
    await seedPackageServer(rootDir, {
      name: "ai.quickdeploy/mcpb-example",
      version: "1.0.0",
      packages: [{ registryType: "mcpb", identifier: "mcpb-example.mcpb" }],
    });

    const result = await validateRegistryEntries({ rootDir });
    expect(result.ok).toBe(false);
    expect(result.violations).toContainEqual(
      expect.objectContaining({
        code: "mcpb-missing-file-sha256",
        name: "ai.quickdeploy/mcpb-example",
      }),
    );
  });

  it("passes an mcpb package with a valid fileSha256", async () => {
    const rootDir = await fixtureRoot();
    await seedPackageServer(rootDir, {
      name: "ai.quickdeploy/mcpb-example",
      version: "1.0.0",
      packages: [
        {
          registryType: "mcpb",
          identifier: "mcpb-example.mcpb",
          fileSha256: "a".repeat(64),
        },
      ],
    });

    const result = await validateRegistryEntries({ rootDir });
    expect(result.ok).toBe(true);
  });

  it("flags an oci package that is not digest-pinned", async () => {
    const rootDir = await fixtureRoot();
    await seedPackageServer(rootDir, {
      name: "ai.quickdeploy/oci-example",
      version: "1.0.0",
      packages: [{ registryType: "oci", identifier: "ghcr.io/quickdeployai/mcp-oci-example" }],
    });

    const result = await validateRegistryEntries({ rootDir });
    expect(result.ok).toBe(false);
    expect(result.violations).toContainEqual(
      expect.objectContaining({
        code: "oci-missing-digest-pin",
        name: "ai.quickdeploy/oci-example",
      }),
    );
  });

  it("exempts the shared unpinned mcp-host runtime image from the digest-pin rule", async () => {
    const rootDir = await fixtureRoot();
    await seedPackageServer(rootDir, {
      name: "ai.quickdeploy/runtime-example",
      version: "1.0.0",
      packages: [{ registryType: "oci", identifier: "ghcr.io/quickdeployai/mcp-host" }],
    });

    const result = await validateRegistryEntries({ rootDir });
    expect(result.ok).toBe(true);
  });

  it("exempts shared importer images that the publish workflow digest-pins", async () => {
    const rootDir = await fixtureRoot();
    await seedPackageServer(rootDir, {
      name: "ai.quickdeploy/asyncapi-2-mcp-importer",
      version: "0.1.0",
      packages: [
        {
          registryType: "oci",
          identifier: "ghcr.io/quickdeployai/importers/asyncapi-2-mcp:0.1.0",
          runtimeHint: "node22-importer",
        },
      ],
    });

    const result = await validateRegistryEntries({ rootDir });
    expect(result.ok).toBe(true);
  });

  it("passes a digest-pinned oci package", async () => {
    const rootDir = await fixtureRoot();
    await seedPackageServer(rootDir, {
      name: "ai.quickdeploy/oci-pinned",
      version: "1.0.0",
      packages: [
        {
          registryType: "oci",
          identifier: `ghcr.io/quickdeployai/mcp-oci-pinned@sha256:${"a".repeat(64)}`,
        },
      ],
    });

    const result = await validateRegistryEntries({ rootDir });
    expect(result.ok).toBe(true);
  });
});

async function fixtureRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), "registry-cli-validate-"));
}

async function seedPackageServer(
  rootDir: string,
  overrides: Record<string, unknown>,
  dirName = "fixture-server",
): Promise<void> {
  const targetDir = join(rootDir, "packages", "importers", dirName);
  await mkdir(targetDir, { recursive: true });
  await writeFile(
    join(targetDir, "server.json"),
    JSON.stringify(
      {
        $schema: "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
        description: "Fixture server for registry validation tests.",
        ...overrides,
      },
      null,
      2,
    ),
  );
}

async function seedRemoteServer(
  rootDir: string,
  overrides: Record<string, unknown>,
  fileName = "fixture.server.json",
): Promise<void> {
  const targetDir = join(rootDir, "manifests", "remotes");
  await mkdir(targetDir, { recursive: true });
  await writeFile(
    join(targetDir, fileName),
    JSON.stringify(
      {
        $schema: "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
        description: "Fixture remote for registry validation tests.",
        ...overrides,
      },
      null,
      2,
    ),
  );
}
