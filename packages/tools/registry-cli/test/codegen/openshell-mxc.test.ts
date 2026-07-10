import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { McpManifest } from "@quickdeployai/registry-schemas";
import {
  OpenShellMxcPolicyError,
  OpenShellMxcUnavailableError,
  buildOpenShellMxcPolicy,
  credentialEnvRefsFromManifest,
  generatedMcpProjectDir,
  runGeneratedProjectBuildAndTestInOpenShellMxc,
  runGeneratedProjectInOpenShellMxc,
  writeOpenShellMxcPolicyFile,
  type OpenShellMxcRunRequest,
  type OpenShellMxcRuntime,
} from "../../src/codegen/openshell-mxc";

describe("OpenShell-backed MXC generated MCP sandbox", () => {
  it("assembles an explicit fail-closed policy from manifest and test requirements", async () => {
    const rootDir = await fixtureRoot();
    const manifest = fixtureManifest();
    const manifestPath = join(rootDir, "registry", "stripe", "api.mcp.json");
    const sourceFixturePath = join(
      rootDir,
      "packages",
      "tools",
      "registry-cli",
      "fixtures",
      "stripe.openapi.json",
    );

    const policy = buildOpenShellMxcPolicy({
      rootDir,
      family: "openapi",
      provider: "stripe",
      manifest,
      manifestPath,
      sourceInputPaths: [sourceFixturePath],
      credentialEnvRefs: ["STRIPE_WEBHOOK_SECRET"],
      networkAllowlist: [
        {
          host: "api.stripe.com",
          methods: ["get"],
          paths: ["/v1/products"],
          reason: "fixture test covers an explicitly selected read-only endpoint",
        },
      ],
    });

    expect(policy.version).toBe(1);
    expect(policy.filesystem_policy).toMatchObject({
      include_workdir: false,
    });
    expect(policy.filesystem_policy.read_only).toEqual(
      expect.arrayContaining([
        join(rootDir, "packages"),
        join(rootDir, "registry"),
        manifestPath,
        sourceFixturePath,
      ]),
    );
    expect(policy.filesystem_policy.read_write).toEqual([
      generatedMcpProjectDir({ rootDir, family: "openapi", provider: "stripe" }),
    ]);
    expect(policy.landlock).toEqual({ compatibility: "hard_requirement" });
    expect(policy.process).toEqual({ run_as_user: "sandbox", run_as_group: "sandbox" });
    expect(policy.network_policies).toEqual({
      generated_mcp_allowlist: {
        name: "mcp-codegen-openapi-stripe",
        endpoints: [
          {
            host: "api.stripe.com",
            port: 443,
            protocol: "rest",
            enforcement: "enforce",
            rules: [{ allow: { method: "GET", path: "/v1/products" } }],
          },
        ],
        binaries: expect.arrayContaining([
          { path: "/usr/bin/node" },
          { path: "/usr/bin/pnpm" },
          { path: "/usr/local/bin/node" },
          { path: "/usr/local/bin/pnpm" },
        ]),
      },
    });
  });

  it("writes the OpenShell policy under the gitignored generated project", async () => {
    const rootDir = await fixtureRoot();
    const { path, yaml } = await writeOpenShellMxcPolicyFile({
      rootDir,
      family: "feed",
      provider: "hacker-news",
      manifestPath: join(rootDir, "registry", "hacker-news", "feed.mcp.json"),
    });

    expect(path).toBe(
      join(rootDir, ".generated", "mcp-codegen", "feed", "hacker-news", "openshell.policy.yaml"),
    );
    expect(await readFile(path, "utf8")).toBe(yaml);
    expect(yaml).toContain("filesystem_policy");
    expect(yaml).toContain("landlock");
    expect(yaml).toContain("network_policies");
    expect(yaml).not.toContain("SECRET_VALUE");
  });

  it("runs fixture build and test only through the OpenShell/MXC runtime adapter", async () => {
    const rootDir = await fixtureRoot();
    const requests: OpenShellMxcRunRequest[] = [];
    const runtime = fakeOpenShellMxcRuntime(requests);

    const result = await runGeneratedProjectBuildAndTestInOpenShellMxc({
      rootDir,
      family: "grpc",
      provider: "greeter",
      manifest: fixtureManifest(),
      manifestPath: join(rootDir, "registry", "greeter", "api.mcp.json"),
      credentialEnvRefs: ["STRIPE_WEBHOOK_SECRET"],
      runtime,
    });

    expect(result).toEqual({
      build: { exitCode: 0, stdout: "build ok", stderr: "" },
      test: { exitCode: 0, stdout: "test ok", stderr: "" },
    });
    expect(requests.map((request) => request.phase)).toEqual(["build", "test"]);
    expect(requests.map((request) => request.runtime)).toEqual([
      { mxc: "required", openshell: "required" },
      { mxc: "required", openshell: "required" },
    ]);
    expect(requests.map((request) => request.command)).toEqual([
      { executable: "pnpm", args: ["run", "build"] },
      { executable: "pnpm", args: ["run", "test"] },
    ]);
    expect(requests[0]?.projectDir).toBe(
      join(rootDir, ".generated", "mcp-codegen", "grpc", "greeter"),
    );
    expect(requests[0]?.policyYaml).toContain("filesystem_policy");
    expect(requests[0]?.directHostExecution).toBe("forbidden");
    expect(requests[0]?.env).toEqual({
      inherit: false,
      refs: [
        { name: "STRIPE_MCP_TOKEN", required: true, secret: true },
        { name: "STRIPE_TOKEN", required: true, secret: true },
        { name: "STRIPE_WEBHOOK_SECRET", required: true, secret: true },
      ],
    });
  });

  it("fails closed when OpenShell/MXC is unavailable", async () => {
    const rootDir = await fixtureRoot();
    const requests: OpenShellMxcRunRequest[] = [];
    const runtime = fakeOpenShellMxcRuntime(requests, { available: false });

    await expect(
      runGeneratedProjectInOpenShellMxc({
        rootDir,
        family: "wsdl",
        provider: "calculator",
        phase: "test",
        runtime,
      }),
    ).rejects.toThrow(OpenShellMxcUnavailableError);
    expect(requests).toEqual([]);

    await expect(
      runGeneratedProjectInOpenShellMxc({
        rootDir,
        family: "wsdl",
        provider: "calculator",
        phase: "test",
      }),
    ).rejects.toThrow(/requires OpenShell-backed MXC isolation/);
  });

  it("rejects generated project paths outside the required .generated layout", async () => {
    const rootDir = await fixtureRoot();

    expect(() =>
      buildOpenShellMxcPolicy({
        rootDir,
        family: "openapi",
        provider: "stripe",
        generatedProjectDir: join(rootDir, "packages", "stripe"),
      }),
    ).toThrow(OpenShellMxcPolicyError);
  });

  it("extracts credential env refs from manifests without reading secret values", () => {
    expect(credentialEnvRefsFromManifest(fixtureManifest())).toEqual([
      "STRIPE_MCP_TOKEN",
      "STRIPE_TOKEN",
    ]);
  });
});

async function fixtureRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), "registry-cli-openshell-mxc-"));
}

function fakeOpenShellMxcRuntime(
  requests: OpenShellMxcRunRequest[],
  options: { available?: boolean } = {},
): OpenShellMxcRuntime {
  return {
    kind: "openshell-mxc",
    async checkAvailability() {
      return options.available === false
        ? { ok: false, reason: "openshell binary not found" }
        : { ok: true, detail: "fixture runtime" };
    },
    async run(request) {
      requests.push(request);
      return {
        exitCode: 0,
        stdout: `${request.phase} ok`,
        stderr: "",
      };
    },
  };
}

function fixtureManifest(): McpManifest {
  return {
    apiVersion: "quickdeploy.ai/v1",
    kind: "McpManifest",
    metadata: {
      name: "ai.quickdeploy/stripe",
      version: "0.1.0",
      labels: ["generated", "openapi"],
    },
    spec: {
      importer: {
        engine: "openapi-2-mcp",
        versionRange: "^0.1.0",
      },
      source: {
        type: "http",
        uri: "https://raw.githubusercontent.com/stripe/openapi/master/openapi/spec3.json",
      },
      select: {
        requests: [{ method: "GET", uriTemplate: "/v1/products" }],
        grpcMethods: [],
        pythonFunctions: [],
        skills: [],
        knowledgeSources: [],
        corpusGlobs: [],
        workflows: [],
      },
      auth: [
        {
          type: "bearer",
          valueFrom: {
            env: "STRIPE_TOKEN",
          },
        },
      ],
      expose: {
        tools: [],
        resources: [],
        prompts: [],
      },
    },
    deployment: {
      transport: "streamable-http",
      auth: {
        type: "bearer",
        tokenFrom: {
          env: "STRIPE_MCP_TOKEN",
        },
      },
      userConfig: {},
    },
  };
}
