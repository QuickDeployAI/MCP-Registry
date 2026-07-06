import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

test("workspace package lanes are declared", async () => {
  const workspace = await readFile(join(import.meta.dirname, "../../../../pnpm-workspace.yaml"), "utf8");

  for (const lane of [
    "packages/core/*",
    "packages/mcp-importers/*",
    "packages/mcps/*",
    "packages/tools/*",
  ]) {
    assert.match(workspace, new RegExp(`- ${lane.replace("*", "\\*")}`));
  }
});
