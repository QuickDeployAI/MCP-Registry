import { constants } from "node:fs";
import { access, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { OpenShellMxcUnavailableError, type OpenShellMxcRuntime } from "../src/codegen/openshell-mxc";
import {
  GeneratedMcpCodegenFlowRunError,
  runGeneratedMcpCodegenFlow,
} from "../src/codegen/orchestrator";
import { FIXTURE_GENERATED_MCP_INTENTS } from "./fixtures/generated-mcp-intents";

const TEST_TIMEOUT_MS = 30_000;
const execFileAsync = promisify(execFile);

describe("generated MCP red/green codegen orchestration", () => {
  it(
    "runs manifest, generated-test, project, and OpenShell/MXC build/test phases in order",
    async () => {
      const rootDir = await fixtureRoot();
      const calls: string[] = [];
      const runtime: OpenShellMxcRuntime = {
        kind: "openshell-mxc",
        async checkAvailability() {
          return { ok: true };
        },
        async run(request) {
          calls.push(request.phase);
          expect(request.runtime).toEqual({ mxc: "required", openshell: "required" });
          expect(request.directHostExecution).toBe("forbidden");
          expect(request.env.inherit).toBe(false);
          expect(request.env.refs.map((ref) => ref.name)).toEqual(["ACME_OPENAPI_TOKEN"]);
          expect(request.projectDir).toContain(".generated/mcp-codegen/openapi/acme-openapi");
          return { exitCode: 0, stdout: `${request.phase} ok`, stderr: "" };
        },
      };

      const result = await runGeneratedMcpCodegenFlow({
        rootDir,
        intent: FIXTURE_GENERATED_MCP_INTENTS[0],
        runtime,
      });

      expect(calls).toEqual(["build", "test"]);
      expect(result.manifest.manifestPath).toBe("registry/acme-openapi/api.mcp.json");
      expect(result.generatedTest.path).toBe(
        "packages/tools/registry-cli/test/generated/openapi/acme-openapi.test.ts",
      );
      expect(result.project.projectPath).toBe(".generated/mcp-codegen/openapi/acme-openapi/");
      await expect(access(join(rootDir, result.manifest.manifestPath), constants.F_OK)).resolves.toBe(
        undefined,
      );
      await expect(access(join(rootDir, result.generatedTest.path), constants.F_OK)).resolves.toBe(
        undefined,
      );
      await expect(
        access(join(rootDir, ".generated", "mcp-codegen", "openapi", "acme-openapi"), constants.F_OK),
      ).resolves.toBe(undefined);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "fails closed when OpenShell/MXC is unavailable while preserving generated artifacts",
    async () => {
      const rootDir = await fixtureRoot();

      await expect(
        runGeneratedMcpCodegenFlow({
          rootDir,
          intent: FIXTURE_GENERATED_MCP_INTENTS[0],
        }),
      ).rejects.toThrow(OpenShellMxcUnavailableError);

      await expect(
        readFile(join(rootDir, "registry", "acme-openapi", "api.mcp.json"), "utf8"),
      ).resolves.toContain("ai.quickdeploy/acme-openapi");
      await expect(
        readFile(
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
          "utf8",
        ),
      ).resolves.toContain("describeGeneratedMcpManifest");
      await expect(
        readFile(
          join(rootDir, ".generated", "mcp-codegen", "openapi", "acme-openapi", "README.md"),
          "utf8",
        ),
      ).resolves.toContain("OpenShell/MXC");
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "surfaces red build/test phases without running generated code on the host",
    async () => {
      const rootDir = await fixtureRoot();
      const runtime: OpenShellMxcRuntime = {
        kind: "openshell-mxc",
        async checkAvailability() {
          return { ok: true };
        },
        async run(request) {
          return {
            exitCode: request.phase === "build" ? 1 : 0,
            stdout: "",
            stderr: "expected red build",
          };
        },
      };

      await expect(
        runGeneratedMcpCodegenFlow({
          rootDir,
          intent: FIXTURE_GENERATED_MCP_INTENTS[0],
          runtime,
        }),
      ).rejects.toMatchObject({
        name: "GeneratedMcpCodegenFlowRunError",
        phase: "build",
      } satisfies Partial<GeneratedMcpCodegenFlowRunError>);

      await expect(
        readFile(
          join(rootDir, ".generated", "mcp-codegen", "openapi", "acme-openapi", "runtime-policy.json"),
          "utf8",
        ),
      ).resolves.toContain("directHostExecution");
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "exposes a registry-cli codegen command that fails closed without OpenShell/MXC",
    async () => {
      const rootDir = await fixtureRoot();
      const intentPath = join(rootDir, "intent.json");
      await writeFile(
        intentPath,
        `${JSON.stringify(FIXTURE_GENERATED_MCP_INTENTS[0], null, 2)}\n`,
        "utf8",
      );

      await expect(
        runRegistryCli(["codegen", "run", "--root", rootDir, "--intent", intentPath]),
      ).rejects.toMatchObject({
        stderr: expect.stringContaining("requires OpenShell-backed MXC isolation"),
      });

      await expect(
        readFile(join(rootDir, "registry", "acme-openapi", "api.mcp.json"), "utf8"),
      ).resolves.toContain("ai.quickdeploy/acme-openapi");
      await expect(
        readFile(
          join(rootDir, ".generated", "mcp-codegen", "openapi", "acme-openapi", "README.md"),
          "utf8",
        ),
      ).resolves.toContain("Do not execute generated provider code directly on the");
    },
    TEST_TIMEOUT_MS,
  );
});

async function fixtureRoot(): Promise<string> {
  const rootDir = await mkdtemp(join(tmpdir(), "generated-mcp-flow-"));
  await writeFile(join(rootDir, ".gitignore"), ".generated/\n", "utf8");
  return rootDir;
}

async function runRegistryCli(args: string[]): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(
    process.execPath,
    [
      join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs"),
      join("src", "cli.mts"),
      ...args,
    ],
    {
      cwd: process.cwd(),
      windowsHide: true,
    },
  );
}
