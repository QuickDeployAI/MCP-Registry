import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  GENERATED_MCP_SANDBOX_RUNTIME,
  GeneratedMcpSandboxUnavailableError,
  createGeneratedMcpSandboxHarness,
  type GeneratedMcpMxcOpenShellRunner,
  type GeneratedMcpSandboxExecutionRequest,
} from "../src/codegen/generated-sandbox";
import { generatedMcpWorkspacePaths } from "../src/codegen/workspace-conventions";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

describe("generated MCP sandbox harness", () => {
  it("routes generated build and test execution through the MXC OpenShell runner", async () => {
    const calls: GeneratedMcpSandboxExecutionRequest[] = [];
    const runner: GeneratedMcpMxcOpenShellRunner = {
      async probe() {
        return { mxcAvailable: true, openShellAvailable: true, supported: true };
      },
      async run(request) {
        calls.push(request);
        return { exitCode: 0, stdout: "", stderr: "" };
      },
    };
    const paths = generatedMcpWorkspacePaths({
      provider: "Example API",
      family: "openapi-2-mcp",
      capability: "api",
    });

    const harness = createGeneratedMcpSandboxHarness({ rootDir: "/repo", runner });
    await harness.build({ paths });
    await harness.test({
      paths,
      env: ["EXAMPLE_API_TOKEN"],
      networkAllowlist: ["https://api.example.com"],
    });

    expect(calls.map((call) => call.phase)).toEqual(["build", "test"]);
    expect(calls.map((call) => call.runtime)).toEqual([
      GENERATED_MCP_SANDBOX_RUNTIME,
      GENERATED_MCP_SANDBOX_RUNTIME,
    ]);
    expect(calls.map((call) => call.command)).toEqual([
      { packageManager: "pnpm", script: "build" },
      { packageManager: "pnpm", script: "test" },
    ]);
    expect(calls[0]?.projectPath).toBe("/repo/.generated/mcp-codegen/openapi/example-api");
    expect(calls[0]?.policy.filesystem).toEqual({
      readOnly: [
        "/repo/registry/example-api/api.mcp.json",
        "/repo/packages/tools/registry-cli/test/generated/openapi/example-api.test.ts",
      ],
      writable: ["/repo/.generated/mcp-codegen/openapi/example-api"],
      ambientHostAccess: "deny",
    });
    expect(calls[0]?.policy.network).toEqual({ default: "deny", allowlist: [] });
    expect(calls[1]?.policy.network).toEqual({
      default: "deny",
      allowlist: ["https://api.example.com"],
    });
    expect(calls[1]?.policy.environment).toEqual({
      secretSource: "env-ref-only",
      allowedEnv: ["EXAMPLE_API_TOKEN"],
    });
    expect(calls[1]?.policy.process).toEqual({
      hostExecution: "deny",
      childProcesses: "deny-outside-mxc-openshell",
    });
  });

  it("fails closed when no MXC OpenShell runner is configured", async () => {
    const harness = createGeneratedMcpSandboxHarness({ rootDir: "/repo" });
    const paths = generatedMcpWorkspacePaths({
      provider: "Example API",
      family: "openapi-2-mcp",
      capability: "api",
    });

    await expect(harness.build({ paths })).rejects.toThrow(GeneratedMcpSandboxUnavailableError);
  });

  it.each([
    {
      name: "MXC unavailable",
      probe: { mxcAvailable: false, openShellAvailable: true, supported: true },
    },
    {
      name: "OpenShell unavailable",
      probe: { mxcAvailable: true, openShellAvailable: false, supported: true },
    },
    {
      name: "unsupported runtime",
      probe: { mxcAvailable: true, openShellAvailable: true, supported: false },
    },
  ])("fails closed when $name", async ({ probe }) => {
    let runCalled = false;
    const runner: GeneratedMcpMxcOpenShellRunner = {
      async probe() {
        return probe;
      },
      async run() {
        runCalled = true;
        return { exitCode: 0, stdout: "", stderr: "" };
      },
    };
    const harness = createGeneratedMcpSandboxHarness({ rootDir: "/repo", runner });
    const paths = generatedMcpWorkspacePaths({
      provider: "Example API",
      family: "openapi-2-mcp",
      capability: "api",
    });

    await expect(harness.test({ paths })).rejects.toThrow(GeneratedMcpSandboxUnavailableError);
    expect(runCalled).toBe(false);
  });

  it("rejects generated project paths outside the gitignored codegen root", async () => {
    const runner: GeneratedMcpMxcOpenShellRunner = {
      async probe() {
        return { mxcAvailable: true, openShellAvailable: true, supported: true };
      },
      async run() {
        return { exitCode: 0, stdout: "", stderr: "" };
      },
    };
    const paths = {
      ...generatedMcpWorkspacePaths({
        provider: "Example API",
        family: "openapi-2-mcp",
        capability: "api",
      }),
      codegenProjectPath: "registry/example-api/generated/",
    };
    const harness = createGeneratedMcpSandboxHarness({ rootDir: "/repo", runner });

    await expect(harness.build({ paths })).rejects.toThrow(/must stay under \.generated/);
  });

  it("does not add direct host execution entrypoints to the codegen layer", async () => {
    const codegenFiles = await collectTypeScriptFiles(
      join(repoRoot, "packages", "tools", "registry-cli", "src", "codegen"),
    );

    for (const file of codegenFiles) {
      const source = await readFile(file, "utf8");
      const label = relative(repoRoot, file);
      expect(source, label).not.toMatch(/node:child_process|node:vm/);
      expect(source, label).not.toMatch(/\b(?:exec|execFile|spawn|fork)\b/);
      expect(source, label).not.toMatch(/\btsx\b/);
    }
  });
});

async function collectTypeScriptFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return collectTypeScriptFiles(path);
      if (entry.isFile() && path.endsWith(".ts")) return [path];
      return [];
    }),
  );
  return files.flat();
}
