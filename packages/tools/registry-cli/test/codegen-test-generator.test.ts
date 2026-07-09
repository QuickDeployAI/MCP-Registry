import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildGeneratedMcpManifest,
  type GeneratedMcpManifestIntent,
} from "../src/codegen/manifest-generator";
import {
  buildGeneratedMcpTestSuite,
  renderGeneratedMcpTestSuite,
  writeGeneratedMcpTestSuite,
} from "../src/codegen/test-generator";
import { GENERATED_MCP_FIXTURE_INTENTS } from "./codegen-fixtures";

const FIXTURE_INTENTS = GENERATED_MCP_FIXTURE_INTENTS;
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

describe("buildGeneratedMcpTestSuite", () => {
  it.each(FIXTURE_INTENTS)("renders a stable generated $family test", (intent) => {
    const manifestResult = buildGeneratedMcpManifest(intent);
    const suite = buildGeneratedMcpTestSuite(manifestResult);

    expect(suite.testPath).toBe(
      `packages/tools/registry-cli/test/generated/${manifestResult.family}/${manifestResult.provider}.test.ts`,
    );
    expect(suite.expectations.expose.tools).toEqual(
      publicExpose(manifestResult.manifest.spec.expose.tools),
    );
    expect(suite.expectations.expose.resources).toEqual(
      publicExpose(manifestResult.manifest.spec.expose.resources),
    );
    expect(suite.expectations.expose.prompts).toEqual(
      publicExpose(manifestResult.manifest.spec.expose.prompts),
    );
    expect(suite.expectations.environmentVariables.map((variable) => variable.name)).toEqual(
      expectedServerEnvironmentVariableNames(intent),
    );
    expect(suite.text).toBe(renderGeneratedMcpTestSuite(suite));
    expect(suite.text).toContain("const MANIFEST_PATH =");
    expect(suite.text).toContain("const MANIFEST =");
    expect(suite.text).toContain("const EXPECTED =");
    expect(suite.text).toContain(suite.manifestPath);
    expect(suite.text).toContain("McpManifestSchema.parse(MANIFEST)");
    expect(suite.text).toContain("compileManifestToServerJson(manifest, MANIFEST_PATH)");
    expect(suite.text).toContain("buildRegistryArtifacts({ rootDir })");
    expect(suite.text).not.toContain(".generated/mcp-codegen");
  });

  it("writes a generated test to the deterministic committed test path", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "generated-mcp-tests-"));
    const result = await writeGeneratedMcpTestSuite({
      rootDir,
      manifest: buildGeneratedMcpManifest(FIXTURE_INTENTS[0]),
    });

    expect(result.path).toBe(
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
    expect(await readFile(result.path, "utf8")).toBe(result.text);
  });

  it.each(FIXTURE_INTENTS)("keeps the committed generated $family fixture stable", async (intent) => {
    const suite = buildGeneratedMcpTestSuite(buildGeneratedMcpManifest(intent));

    expect(await readFile(join(REPO_ROOT, suite.testPath), "utf8")).toBe(suite.text);
  });

  it("bakes expected expose and auth assertions so stale generated tests fail meaningfully", () => {
    const suite = buildGeneratedMcpTestSuite(buildGeneratedMcpManifest(FIXTURE_INTENTS[3]));

    expect(suite.text).toContain('"from": "SOAP Calculator/Add"');
    expect(suite.text).toContain('"name": "soap_calculator_add"');
    expect(suite.text).toContain('"ACME_SOAP_USERNAME"');
    expect(suite.text).toContain('"ACME_SOAP_PASSWORD"');
    expect(suite.text).toContain(
      "expect(publicExpose(manifest.spec.expose.tools)).toEqual(EXPECTED.expose.tools)",
    );
    expect(suite.text).toContain("expectedEnvironmentVariableNames()");
  });
});

function publicExpose<T extends { deny?: boolean }>(items: readonly T[]): T[] {
  return items.filter((item) => !item.deny).map((item) => ({ ...item }));
}

function expectedServerEnvironmentVariableNames(intent: GeneratedMcpManifestIntent): string[] {
  const names = new Set<string>();
  for (const auth of intent.auth ?? []) {
    switch (auth.type) {
      case "bearer":
      case "api-key":
        names.add(auth.valueFrom.env);
        break;
      case "basic":
        names.add(auth.usernameFrom.env);
        names.add(auth.passwordFrom.env);
        break;
      case "oauth2":
        if (auth.valueFrom) names.add(auth.valueFrom.env);
        if (auth.clientIdFrom) names.add(auth.clientIdFrom.env);
        if (auth.clientSecretFrom) names.add(auth.clientSecretFrom.env);
        break;
    }
  }
  if (intent.deployment?.auth?.type === "bearer" && intent.deployment.auth.tokenFrom) {
    names.add(intent.deployment.auth.tokenFrom.env);
  }
  if (intent.deployment?.auth?.type === "oauth2-resource" && intent.deployment.auth.tokenFrom) {
    names.add(intent.deployment.auth.tokenFrom.env);
  }
  const requiredConfig = new Set(
    Array.isArray(intent.deployment?.configSchema?.required)
      ? intent.deployment.configSchema.required
      : [],
  );
  for (const property of requiredConfig) names.add(`QD_MANIFEST_${toEnvSegment(property)}`);
  return [...names].sort((left, right) => left.localeCompare(right));
}

function toEnvSegment(value: string): string {
  const segment = value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
  return segment.length > 0 ? segment : "VALUE";
}
