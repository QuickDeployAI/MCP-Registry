import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  GIT2MCP_AUDIT_META_KEY,
  InMemoryGit2McpContentStore,
  SubprocessPythonSandboxRunner,
  TypeScriptSandboxRunner,
  attachSupplyChainAuditMeta,
  buildGit2McpManifest,
  buildGit2McpRuntimeSurface,
  buildTypeScriptGit2McpManifest,
  callGit2McpTool,
  callTypeScriptTool,
  fixturePackageRoot,
  fixtureTypeScriptPackageRoot,
  validateSupplyChainPolicy,
} from "./index.js";

const SUBPROCESS_SANDBOX_TEST_TIMEOUT_MS = 60_000;

function pythonRunner(): SubprocessPythonSandboxRunner {
  return new SubprocessPythonSandboxRunner({ pythonBin: "python3", timeoutMs: 15_000 });
}

describe("git-2-mcp manifest", () => {
  it("discovers a curated public function surface through the sandbox runner", async () => {
    const manifest = await buildGit2McpManifest({
      maxTools: 10,
      runner: pythonRunner(),
      sandbox: { timeoutMs: 10_000 },
    });

    expect(manifest.sandbox).toMatchObject({
      network: "disabled",
      sourceMount: "readonly",
      timeoutMs: 10_000,
    });
    expect(manifest.tools.map((tool) => tool.name)).toEqual([
      "python_add",
      "python_slugify",
      "python_summarize",
      "python_guess_kind",
      "python_texttools_initials",
      "python_texttools_repeat",
    ]);
    expect(manifest.supplyChain).toMatchObject({
      source: {
        uri: "git+https://github.com/QuickDeployAI/git-2-mcp-fixture.git",
        ref: "0123456789abcdef0123456789abcdef01234567",
      },
      audit: {
        scanner: "quickdeploy-git2mcp-audit",
        status: "passed",
        dependencyCount: 1,
      },
    });
    expect(manifest.tools.find((tool) => tool.name === "python_add")?.inputSchema).toEqual({
      type: "object",
      properties: {
        left: { type: "integer" },
        right: { type: "integer" },
      },
      required: ["left", "right"],
    });
    expect(manifest.tools.find((tool) => tool.name === "python_summarize")?.inputSchema).toEqual({
      type: "object",
      properties: {
        items: { type: "array", items: { type: "string" } },
      },
      required: ["items"],
    });
    expect(manifest.tools.find((tool) => tool.name === "python_guess_kind")).toMatchObject({
      description: "Return a coarse kind for an untyped value.",
      inputSchema: {
        type: "object",
        properties: {
          value: {},
        },
        required: ["value"],
      },
    });
    expect(manifest.tools.some((tool) => tool.name.includes("hidden"))).toBe(false);
  });

  it("caps the curated manifest after stable public traversal", async () => {
    const manifest = await buildGit2McpManifest({
      maxTools: 4,
      runner: pythonRunner(),
      sandbox: { timeoutMs: 10_000 },
    });

    expect(manifest.tools.map((tool) => tool.name)).toEqual([
      "python_add",
      "python_slugify",
      "python_summarize",
      "python_guess_kind",
    ]);
  });

  it("preserves configurable sandbox limits in the manifest", async () => {
    const manifest = await buildGit2McpManifest({
      runner: pythonRunner(),
      sandbox: {
        egressAllowlist: ["pypi.org", "files.pythonhosted.org:443"],
        memoryMb: 128,
        outputLimitBytes: 4_096,
        timeoutMs: 10_000,
      },
    });

    expect(manifest.sandbox).toMatchObject({
      egressAllowlist: ["pypi.org", "files.pythonhosted.org:443"],
      memoryMb: 128,
      outputLimitBytes: 4_096,
      processLimit: 1,
      timeoutMs: 10_000,
    });
  });

  it(
    "invokes fixture functions across the JSON sandbox boundary",
    async () => {
      const packageRoot = fixturePackageRoot();
      const runner = pythonRunner();
      const manifest = await buildGit2McpManifest({ maxTools: 10, packageRoot, runner });

      await expect(
        callGit2McpTool({
          manifest,
          packageRoot,
          runner,
          toolName: "python_add",
          args: [2, 5],
        }),
      ).resolves.toBe(7);
      await expect(
        callGit2McpTool({
          manifest,
          packageRoot,
          runner,
          toolName: "python_slugify",
          args: ["Hello MCP Everywhere"],
        }),
      ).resolves.toBe("hello-mcp-everywhere");
      await expect(
        callGit2McpTool({
          manifest,
          packageRoot,
          runner,
          toolName: "python_texttools_initials",
          args: ["model context protocol"],
        }),
      ).resolves.toBe("MCP");
      await expect(
        callGit2McpTool({
          manifest,
          packageRoot,
          runner,
          toolName: "python_texttools_repeat",
          args: ["ha", 3],
        }),
      ).resolves.toBe("hahaha");
    },
    SUBPROCESS_SANDBOX_TEST_TIMEOUT_MS,
  );

  it(
    "supports docs-search, curated tool calls, and run-code overflow for the sample package",
    async () => {
      const packageRoot = fixturePackageRoot();
      const runner = pythonRunner();
      const contentStore = new InMemoryGit2McpContentStore();
      const surface = await buildGit2McpRuntimeSurface({
        contentStore,
        inlineOutputLimitBytes: 80,
        packageRoot,
        runner,
      });

      expect(surface.tools.map((tool) => tool.name)).toEqual([
        "python_add",
        "python_slugify",
        "python_summarize",
        "docs_search",
        "run_code",
      ]);

      const docs = await surface.searchDocs({ query: "slug", topK: 1 });
      expect(docs.results[0]).toMatchObject({
        source: "docstring:qdai_git_fixture.slugify",
        title: "slugify",
      });
      expect(docs.results[0]?.text).toContain("lowercase hyphen-separated slug");

      await expect(
        surface.callTool({ name: "python_slugify", args: ["Hello MCP Everywhere"] }),
      ).resolves.toEqual({
        kind: "inline",
        value: "hello-mcp-everywhere",
      });

      const readmeDocs = await surface.searchDocs({
        query: "aggregate information text values",
        topK: 1,
      });
      expect(readmeDocs.results[0]).toMatchObject({
        source: "README.md",
        title: "qdai-git-fixture",
      });

      await expect(
        surface.callTool({
          name: "run_code",
          code: [
            "from qdai_git_fixture import summarize",
            "result = summarize(['MCP', 'Everywhere'])",
          ].join("\n"),
        }),
      ).resolves.toEqual({
        kind: "inline",
        value: {
          result: { count: 2, characters: 13 },
          stdout: "",
        },
      });

      const overflow = await surface.callTool({
        name: "run_code",
        code: "print('x' * 200)\nresult = 'done'",
      });

      expect(overflow.kind).toBe("contentRef");
      if (overflow.kind !== "contentRef") throw new Error("expected ContentRef overflow");
      expect(overflow.text).toContain("ContentRef");
      expect(overflow.contentRef.charLength).toBeGreaterThan(80);
      await expect(contentStore.read(overflow.contentRef.id)).resolves.toContain("x".repeat(80));
    },
    SUBPROCESS_SANDBOX_TEST_TIMEOUT_MS,
  );

  it("contains host filesystem read attempts", async () => {
    const hostTemp = await mkdtemp(path.join(tmpdir(), "qdai-host-secret-"));
    const secretPath = path.join(hostTemp, "secret.txt");
    await writeFile(secretPath, "do-not-read", "utf8");

    try {
      const runner = pythonRunner();

      await expect(
        runner.call({
          module: "qdai_git_fixture.attacks",
          packageRoot: fixturePackageRoot(),
          functionName: "read_host_file",
          args: [secretPath],
        }),
      ).rejects.toThrow(/sandbox denied host filesystem access/);
    } finally {
      await rm(hostTemp, { force: true, recursive: true });
    }
  });

  it("contains arbitrary network egress attempts", async () => {
    const runner = pythonRunner();

    await expect(
      runner.call({
        module: "qdai_git_fixture.attacks",
        packageRoot: fixturePackageRoot(),
        functionName: "connect_to",
        args: ["198.51.100.1", 443],
      }),
    ).rejects.toThrow(/sandbox denied network egress: 198\.51\.100\.1:443/);
  });

  it("contains child process creation attempts", async () => {
    const runner = pythonRunner();

    await expect(
      runner.call({
        module: "qdai_git_fixture.attacks",
        packageRoot: fixturePackageRoot(),
        functionName: "spawn_python",
        args: [],
      }),
    ).rejects.toThrow(/sandbox denied child process creation/);
  });

  it("contains long-running calls with the wall-clock timeout", async () => {
    const runner = new SubprocessPythonSandboxRunner({ pythonBin: "python3", timeoutMs: 150 });

    await expect(
      runner.call({
        module: "qdai_git_fixture.attacks",
        packageRoot: fixturePackageRoot(),
        functionName: "sleep_for",
        args: [5],
      }),
    ).rejects.toThrow(/sandbox timed out after 150ms/);
  });

  it("keeps the source mount read-only", async () => {
    const runner = pythonRunner();
    const sourcePath = path.join(
      fixturePackageRoot(),
      "src",
      "qdai_git_fixture",
      "owned.txt",
    );

    await expect(
      runner.call({
        module: "qdai_git_fixture.attacks",
        packageRoot: fixturePackageRoot(),
        functionName: "write_source_file",
        args: [sourcePath],
      }),
    ).rejects.toThrow(/sandbox denied source write/);
  });

  it("attaches dependency audit evidence under registry _meta", async () => {
    const manifest = await buildGit2McpManifest({
      runner: pythonRunner(),
    });
    const serverJson = attachSupplyChainAuditMeta(
      {
        name: "ai.quickdeploy/git-fixture",
        _meta: {
          "ai.quickdeploy.registry/reviewer": "security",
        },
      },
      manifest.supplyChain.audit,
    );

    expect(serverJson._meta[GIT2MCP_AUDIT_META_KEY]).toEqual(manifest.supplyChain.audit);
    expect(serverJson._meta["ai.quickdeploy.registry/reviewer"]).toBe("security");
  });

  it("rejects floating source refs before a git-2-mcp manifest can publish", () => {
    expect(() =>
      validateSupplyChainPolicy({
        ...validSupplyChainPolicy(),
        source: {
          uri: "git+https://github.com/QuickDeployAI/example.git",
          ref: "main",
        },
      }),
    ).toThrow(/source ref must be an immutable commit SHA/);
  });

  it("rejects unpinned dependency versions", () => {
    expect(() =>
      validateSupplyChainPolicy({
        ...validSupplyChainPolicy(),
        dependencies: [
          {
            name: "requests",
            version: ">=2.32.0",
            hashes: ["sha256:abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd"],
          },
        ],
      }),
    ).toThrow(/dependency requests must use an exact pinned version/);
  });

  it("rejects dependencies without hash pins", () => {
    expect(() =>
      validateSupplyChainPolicy({
        ...validSupplyChainPolicy(),
        dependencies: [
          {
            name: "requests",
            version: "2.32.4",
            hashes: [],
          },
        ],
      }),
    ).toThrow(/dependency requests must include at least one hash pin/);
  });

  it("rejects failed or incomplete dependency audits", () => {
    expect(() =>
      validateSupplyChainPolicy({
        ...validSupplyChainPolicy(),
        audit: {
          ...validSupplyChainPolicy().audit,
          status: "failed",
        },
      }),
    ).toThrow(/dependency audit must pass/);

    expect(() =>
      validateSupplyChainPolicy({
        ...validSupplyChainPolicy(),
        audit: {
          ...validSupplyChainPolicy().audit,
          dependencyCount: 0,
        },
      }),
    ).toThrow(/dependency audit must cover every pinned dependency/);
  });
});

describe("git-2-mcp TypeScript package support", () => {
  it("discovers typed TS exports as MCP tools", async () => {
    const manifest = await buildTypeScriptGit2McpManifest({
      runner: new TypeScriptSandboxRunner(),
    });

    expect(manifest.runtime).toBe("node");
    expect(manifest.tools.map((tool) => tool.name)).toEqual([
      "typescript_add",
      "typescript_slugify",
      "typescript_summarize",
    ]);
    expect(manifest.tools.find((tool) => tool.name === "typescript_add")?.inputSchema).toEqual({
      type: "object",
      properties: {
        left: { type: "integer" },
        right: { type: "integer" },
      },
      required: ["left", "right"],
    });
  });

  it("invokes typed TS exports through the sandbox boundary", async () => {
    const packageRoot = fixtureTypeScriptPackageRoot();
    const runner = new TypeScriptSandboxRunner();
    const manifest = await buildTypeScriptGit2McpManifest({ packageRoot, runner });

    await expect(
      callTypeScriptTool({
        manifest,
        packageRoot,
        runner,
        toolName: "typescript_add",
        args: [3, 8],
      }),
    ).resolves.toBe(11);
    await expect(
      callTypeScriptTool({
        manifest,
        packageRoot,
        runner,
        toolName: "typescript_summarize",
        args: [["MCP", "Everywhere"]],
      }),
    ).resolves.toEqual({ count: 2, characters: 13 });
  });
});

function validSupplyChainPolicy() {
  return {
    source: {
      uri: "git+https://github.com/QuickDeployAI/example.git",
      ref: "abcdefabcdefabcdefabcdefabcdefabcdefabcd",
    },
    allowedIndexes: ["https://pypi.org/simple"],
    lockfileDigest: "sha256:abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd",
    dependencies: [
      {
        name: "requests",
        version: "2.32.4",
        hashes: ["sha256:abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd"],
      },
    ],
    audit: {
      scanner: "pip-audit",
      generatedAt: "2026-07-06T00:00:00.000Z",
      status: "passed" as const,
      dependencyCount: 1,
      findings: [],
    },
  };
}
