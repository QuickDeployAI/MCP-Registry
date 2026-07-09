/**
 * Demo: an agent calling every method of a small Python library through MCP.
 *
 * Loads the qdai-git-fixture MCP manifest, hosts it in-process with
 * @quickdeployai/mcp-host, lists the tools git-2-mcp derived from the
 * package's public surface, then calls each one exactly as an MCP client
 * would over JSON-RPC.
 *
 * Run from the repo root:
 *   pnpm --filter @quickdeployai/mcp-host run demo:git-fixture
 */
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fixturePackageRoot } from "@quickdeployai/git-2-mcp";
import { validateMcpManifestImporterConfig } from "@quickdeployai/registry-schemas";
import { createMcpHost } from "../src/runtime.js";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const calls = [
  { name: "fixture_add", arguments: { left: 13, right: 29 } },
  { name: "fixture_slugify", arguments: { value: "  QuickDeploy AI  " } },
  { name: "fixture_summarize", arguments: { items: ["mcp", "manifest", "host"] } },
  { name: "fixture_guess_kind", arguments: { value: 42 } },
  { name: "fixture_text_initials", arguments: { value: "quick deploy ai" } },
  { name: "fixture_text_repeat", arguments: { value: "ab", count: 3 } },
];

async function main() {
  const manifest = await loadCommittedManifest("registry/quickdeploy/qdai-git-fixture.mcp.json");
  const host = createMcpHost({
    manifest,
    userConfig: { packageRoot: fixturePackageRoot() },
  });

  const tools = await host.handleJsonRpc({
    jsonrpc: "2.0",
    id: "tools",
    method: "tools/list",
  });
  console.log(
    `Discovered ${(tools as any).result.tools.length} tools from ${manifest.metadata.name}:`,
  );
  for (const tool of (tools as any).result.tools) {
    console.log(`  - ${tool.name}: ${tool.description}`);
  }
  console.log();

  for (const call of calls) {
    const response = await host.handleJsonRpc({
      jsonrpc: "2.0",
      id: call.name,
      method: "tools/call",
      params: call,
    });
    const text = (response as any).result?.content?.[0]?.text;
    console.log(`${call.name}(${JSON.stringify(call.arguments)}) -> ${text}`);
  }
}

async function loadCommittedManifest(manifestPath: string) {
  return validateMcpManifestImporterConfig(
    JSON.parse(await readFile(resolve(rootDir, manifestPath), "utf8")),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
