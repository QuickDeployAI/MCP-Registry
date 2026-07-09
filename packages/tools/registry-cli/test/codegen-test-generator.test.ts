import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildGeneratedMcpTestFile,
  writeGeneratedMcpTestFile,
} from "../src/codegen/test-generator";
import { FIXTURE_GENERATED_MCP_INTENTS } from "./fixtures/generated-mcp-intents";

describe("buildGeneratedMcpTestFile", () => {
  it.each(FIXTURE_GENERATED_MCP_INTENTS)(
    "renders a stable generated test file for $family",
    (intent) => {
      const result = buildGeneratedMcpTestFile(intent);

      expect(result.text).toContain("describeGeneratedMcpManifest");
      expect(result.text).toContain(result.path.split("/").at(-1)?.replace(".test.ts", ""));
      expect(result.text).toContain(result.manifestPath);
      expect(result.text).toContain(result.manifest.metadata.name);
      expect(buildGeneratedMcpTestFile(intent).text).toBe(result.text);
    },
  );

  it("writes generated tests to the deterministic committed test path", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "generated-mcp-test-"));
    const result = await writeGeneratedMcpTestFile({
      rootDir,
      intent: FIXTURE_GENERATED_MCP_INTENTS[0],
    });

    expect(result.path).toBe(
      "packages/tools/registry-cli/test/generated/openapi/acme-openapi.test.ts",
    );
    expect(result.absolutePath).toBe(
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
    expect(await readFile(result.absolutePath, "utf8")).toBe(result.text);
  });
});
