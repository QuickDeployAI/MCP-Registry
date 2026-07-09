/**
 * Demo: an agent calling every method of a small Python library through MCP.
 *
 * Loads the qdai-git-fixture ARD entry + projection config, hosts it in-process with
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
import {
  ArdEntrySchema,
  McpProjectionConfigSchema,
  sourceMediaTypeToImporterEngine,
  validateMcpManifestImporterConfig,
} from "@quickdeployai/registry-schemas";
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
  const manifest = await loadProjectedManifest("manifests/qdai-git-fixture.ard.json");
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

async function loadProjectedManifest(entryPath: string) {
  const absoluteEntryPath = resolve(rootDir, entryPath);
  const projectionPath = absoluteEntryPath.replace(/\.ard\.json$/, ".projection.json");
  const entry = ArdEntrySchema.parse(JSON.parse(await readFile(absoluteEntryPath, "utf8")));
  const projection = McpProjectionConfigSchema.parse(
    JSON.parse(await readFile(projectionPath, "utf8")),
  );
  const engine = sourceMediaTypeToImporterEngine(entry.type);
  if (!engine || !entry.url) throw new Error(`Cannot project ${entryPath}.`);
  if (projection.entryRef !== entry.identifier) {
    throw new Error(`Projection ${projectionPath} references ${projection.entryRef}.`);
  }
  return validateMcpManifestImporterConfig({
    apiVersion: "quickdeploy.ai/v1",
    kind: "McpManifest",
    metadata: {
      name: `ai.quickdeploy/${entry.identifier.split(":").at(-1)}`,
      version: entry.version ?? "0.1.0",
      title: entry.displayName,
      description: entry.description,
      labels: entry.tags,
    },
    spec: {
      importer: { engine, versionRange: projection.importerVersionRange },
      source: { type: "git", uri: entry.url },
      select: projection.select,
      auth: projection.auth,
      ...(projection.config ? { config: projection.config } : {}),
      expose: projection.expose,
    },
    deployment: projection.deployment,
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
