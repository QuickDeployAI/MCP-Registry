import { constants } from "node:fs";
import { access, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import {
  OpenShellMxcUnavailableError,
  type OpenShellMxcRunRequest,
  type OpenShellMxcRuntime,
} from "../src/codegen/openshell-mxc";
import {
  GeneratedMcpRedGreenRunError,
  runGeneratedMcpRedGreenCodegen,
} from "../src/codegen/red-green-orchestrator";
import { FIXTURE_GENERATED_MCP_INTENTS } from "./fixtures/generated-mcp-intents";

const execFileAsync = promisify(execFile);

describe("generated MCP red/green orchestration", () => {
  it("runs the full manifest-first flow through OpenShell-backed MXC", async () => {
    const rootDir = await fixtureRoot();
    const requests: OpenShellMxcRunRequest[] = [];
    const runtime = fakeOpenShellMxcRuntime(requests);

    const result = await runGeneratedMcpRedGreenCodegen({
      rootDir,
      intent: FIXTURE_GENERATED_MCP_INTENTS[0],
      runtime,
      cleanGeneratedProject: true,
      sourceFixtures: [{ path: "spec/openapi.json", contents: "{\"openapi\":\"3.1.0\"}\n" }],
      credentialEnvRefs: ["ACME_OPENAPI_WEBHOOK_SECRET"],
      networkAllowlist: [
        {
          host: "api.example.test",
          methods: ["GET"],
          paths: ["/widgets/{id}"],
          reason: "fixture provider exposes one selected read endpoint",
        },
      ],
    });

    expect(result.steps.map((step) => step.name)).toEqual([
      "manifest",
      "generated-test",
      "codegen-project",
      "openshell-policy",
      "sandbox-build",
      "sandbox-test",
    ]);
    expect(await readFile(result.manifest.path, "utf8")).toBe(result.manifest.text);
    expect(await readFile(result.generatedTest.absolutePath, "utf8")).toBe(result.generatedTest.text);
    expect(await readFile(join(result.codegenProject.absoluteProjectPath, "manifest.mcp.json"), "utf8"))
      .toBe(result.manifest.text);
    await expect(
      access(join(result.codegenProject.absoluteProjectPath, "fixtures", "spec", "openapi.json")),
    ).resolves.toBeUndefined();
    expect(await readFile(result.openshellPolicy.path, "utf8")).toBe(result.openshellPolicy.yaml);

    expect(requests.map((request) => request.phase)).toEqual(["build", "test"]);
    expect(requests.map((request) => request.runtime)).toEqual([
      { mxc: "required", openshell: "required" },
      { mxc: "required", openshell: "required" },
    ]);
    expect(requests.map((request) => request.command)).toEqual([
      { executable: "pnpm", args: ["run", "build"] },
      { executable: "pnpm", args: ["run", "test"] },
    ]);
    expect(requests[0]?.directHostExecution).toBe("forbidden");
    expect(requests[0]?.projectDir).toBe(result.codegenProject.absoluteProjectPath);
    expect(requests[0]?.policy.filesystem_policy.read_write).toEqual([
      result.codegenProject.absoluteProjectPath,
    ]);
    expect(requests[0]?.policyYaml).toContain("landlock");
    expect(requests[0]?.env).toEqual({
      inherit: false,
      refs: [
        { name: "ACME_OPENAPI_TOKEN", required: true, secret: true },
        { name: "ACME_OPENAPI_WEBHOOK_SECRET", required: true, secret: true },
      ],
    });
    expect(result.build).toEqual({ exitCode: 0, stdout: "build ok", stderr: "" });
    expect(result.test).toEqual({ exitCode: 0, stdout: "test ok", stderr: "" });
  });

  it("fails closed without running generated code when OpenShell/MXC is unavailable", async () => {
    const rootDir = await fixtureRoot();
    const requests: OpenShellMxcRunRequest[] = [];
    const runtime = fakeOpenShellMxcRuntime(requests, { available: false });

    await expect(
      runGeneratedMcpRedGreenCodegen({
        rootDir,
        intent: FIXTURE_GENERATED_MCP_INTENTS[1],
        runtime,
      }),
    ).rejects.toThrow(OpenShellMxcUnavailableError);

    expect(requests).toEqual([]);
    await expect(
      access(join(rootDir, ".generated", "mcp-codegen", "asyncapi", "acme-events", "package.json")),
    ).resolves.toBeUndefined();
    await expect(
      access(
        join(
          rootDir,
          ".generated",
          "mcp-codegen",
          "asyncapi",
          "acme-events",
          "openshell.policy.yaml",
        ),
      ),
    ).resolves.toBeUndefined();
  });

  it("preserves failing generated artifacts for the next green run", async () => {
    const rootDir = await fixtureRoot();
    const redRequests: OpenShellMxcRunRequest[] = [];

    let projectPath = "";
    await expect(
      runGeneratedMcpRedGreenCodegen({
        rootDir,
        intent: FIXTURE_GENERATED_MCP_INTENTS[2],
        runtime: fakeOpenShellMxcRuntime(redRequests, { failPhase: "test" }),
        cleanGeneratedProject: true,
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(GeneratedMcpRedGreenRunError);
      if (error instanceof GeneratedMcpRedGreenRunError) {
        expect(error.phase).toBe("test");
        expect(error.result.exitCode).toBe(1);
        projectPath = error.artifacts.codegenProject.absoluteProjectPath;
      }
      return true;
    });

    expect(redRequests.map((request) => request.phase)).toEqual(["build", "test"]);
    await expect(access(join(projectPath, "package.json"), constants.F_OK)).resolves.toBeUndefined();

    const debugArtifact = join(projectPath, "debug.log");
    await writeFile(debugArtifact, "preserve me between red and green runs\n", "utf8");

    const greenRequests: OpenShellMxcRunRequest[] = [];
    const green = await runGeneratedMcpRedGreenCodegen({
      rootDir,
      intent: FIXTURE_GENERATED_MCP_INTENTS[2],
      runtime: fakeOpenShellMxcRuntime(greenRequests),
    });

    expect(green.test.exitCode).toBe(0);
    expect(await readFile(debugArtifact, "utf8")).toContain("preserve me");
    expect(green.codegenProject.absoluteProjectPath).toBe(projectPath);
  });

  it("refuses to run without an OpenShell-backed MXC runtime adapter", async () => {
    const rootDir = await fixtureRoot();

    await expect(
      runGeneratedMcpRedGreenCodegen({
        rootDir,
        intent: FIXTURE_GENERATED_MCP_INTENTS[3],
      }),
    ).rejects.toThrow(/requires OpenShell-backed MXC isolation/);
  });

  it("exposes a registry-cli command that fails closed when no runtime is configured", async () => {
    const rootDir = await fixtureRoot();
    const intentPath = join(rootDir, "intent.json");
    const sourceInputPath = join(rootDir, "source-feed.xml");
    await writeFile(intentPath, JSON.stringify(FIXTURE_GENERATED_MCP_INTENTS[4], null, 2), "utf8");
    await writeFile(sourceInputPath, "<rss version=\"2.0\"></rss>\n", "utf8");

    await expect(
      runRegistryCli([
        "codegen",
        "red-green",
        "--root",
        rootDir,
        "--intent",
        "intent.json",
        "--source-input",
        "source-feed.xml",
        "--credential-env",
        "ACME_FEED_RUNTIME_TOKEN",
        "--allow-network",
        "feeds.example.test:fixture feed endpoint",
      ]),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("requires OpenShell-backed MXC isolation"),
    });

    await expect(
      access(join(rootDir, "registry", "acme-feed", "feed.mcp.json")),
    ).resolves.toBeUndefined();
    await expect(
      access(
        join(
          rootDir,
          "packages",
          "tools",
          "registry-cli",
          "test",
          "generated",
          "feed",
          "acme-feed.test.ts",
        ),
      ),
    ).resolves.toBeUndefined();
    await expect(
      access(join(rootDir, ".generated", "mcp-codegen", "feed", "acme-feed", "package.json")),
    ).resolves.toBeUndefined();
    const policy = await readFile(
      join(rootDir, ".generated", "mcp-codegen", "feed", "acme-feed", "openshell.policy.yaml"),
      "utf8",
    );
    expect(policy).toContain(sourceInputPath);
    expect(policy).toContain("feeds.example.test");
  }, 60_000);
});

async function fixtureRoot(): Promise<string> {
  const rootDir = await mkdtemp(join(tmpdir(), "registry-cli-red-green-"));
  await writeFile(join(rootDir, ".gitignore"), ".generated/\n", "utf8");
  return rootDir;
}

function fakeOpenShellMxcRuntime(
  requests: OpenShellMxcRunRequest[],
  options: { available?: boolean; failPhase?: "build" | "test" } = {},
): OpenShellMxcRuntime {
  return {
    kind: "openshell-mxc",
    async checkAvailability() {
      return options.available === false
        ? { ok: false, reason: "OpenShell binary missing in fixture" }
        : { ok: true, detail: "fixture runtime" };
    },
    async run(request) {
      requests.push(request);
      if (request.phase === options.failPhase) {
        return {
          exitCode: 1,
          stdout: "",
          stderr: `${request.phase} failed as expected`,
        };
      }
      return {
        exitCode: 0,
        stdout: `${request.phase} ok`,
        stderr: "",
      };
    },
  };
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
