#!/usr/bin/env node

import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { getImporterConfigSchema } from "@quickdeployai/registry-schemas";
import {
  buildRegistryArtifacts,
  checkGeneratedRegistryArtifacts,
  compileBakedManifestFileToServerJson,
  writeRegistryArtifacts,
} from "./registry-build";
import {
  failedRemoteLivenessResults,
  formatRemoteLivenessResults,
  validateRemoteLiveness,
} from "./remote-liveness";
import { formatRegistryValidationViolations, validateRegistryEntries } from "./registry-validate";
import {
  writeImporterScaffold,
  writeScaffoldManifest,
  type ScaffoldAuthType,
  type ScaffoldManifestFileOptions,
} from "./scaffold";

function usage(): string {
  return [
    "Usage: registry-cli build [--root <dir>] [--check]",
    "       registry-cli validate [--root <dir>]",
    "       registry-cli validate-remotes [--root <dir>] [--timeout-ms <ms>] [--server-json <path>]",
    "       registry-cli bake --manifest <path> --image <oci-image> --digest <sha256:digest> [--root <dir>]",
    "       registry-cli config-schema --importer <engine>",
    "       registry-cli scaffold importer <name> [--description <text>] [--force]",
    "       registry-cli scaffold manifest <importer> --name <name> --source-type <http|file|git|oci>",
    "                 --source-uri <uri> [--request <METHOD>:<uriTemplate>] [--skill <name>[:<glob,...>]]",
    "                 [--grpc <service>:<method>] [--corpus-glob <glob>] [--auth <type>:<ENV_VAR>]",
    "                 [--transport <stdio|streamable-http|sse>] [--out <path>] [--force]",
    "",
    "Builds servers.json from package server.json files, direct MCP manifests,",
    "and remotes-only server.json documents.",
    "",
    "scaffold importer/manifest prompt interactively for missing required values",
    "when stdin is a TTY; otherwise missing values are reported as errors.",
  ].join("\n");
}

function readArgs(argv: string[]): {
  command: string;
  rootDir: string;
  check: boolean;
  importer?: string;
  manifestPath?: string;
  image?: string;
  digest?: string;
  bakedManifestPath?: string;
  timeoutMs?: number;
  serverJsonPath?: string;
} {
  const [command = "build", ...rest] = argv;
  let rootDir = findWorkspaceRoot(process.cwd());
  let check = false;
  let importer: string | undefined;
  let manifestPath: string | undefined;
  let image: string | undefined;
  let digest: string | undefined;
  let bakedManifestPath: string | undefined;
  let timeoutMs: number | undefined;
  let serverJsonPath: string | undefined;

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === "--check") {
      check = true;
      continue;
    }
    if (arg === "--root") {
      const value = rest[index + 1];
      if (!value) throw new Error("--root requires a directory.");
      rootDir = value;
      index += 1;
      continue;
    }
    if (arg === "--importer") {
      const value = rest[index + 1];
      if (!value) throw new Error("--importer requires an importer engine.");
      importer = value;
      index += 1;
      continue;
    }
    if (arg === "--manifest") {
      manifestPath = requireValue(arg, rest[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--image") {
      image = requireValue(arg, rest[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--digest") {
      digest = requireValue(arg, rest[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--baked-manifest-path") {
      bakedManifestPath = requireValue(arg, rest[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--timeout-ms") {
      const value = Number(requireValue(arg, rest[index + 1]));
      if (!Number.isInteger(value) || value <= 0)
        throw new Error("--timeout-ms must be a positive integer.");
      timeoutMs = value;
      index += 1;
      continue;
    }
    if (arg === "--server-json") {
      serverJsonPath = requireValue(arg, rest[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      process.stdout.write(`${usage()}\n`);
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return {
    command,
    rootDir,
    check,
    importer,
    manifestPath,
    image,
    digest,
    bakedManifestPath,
    timeoutMs,
    serverJsonPath,
  };
}

function findWorkspaceRoot(startDir: string): string {
  let current = resolve(startDir);
  while (true) {
    if (existsSync(join(current, "pnpm-workspace.yaml"))) return current;
    const parent = dirname(current);
    if (parent === current) return resolve(startDir);
    current = parent;
  }
}

function requireValue(flag: string, value: string | undefined): string {
  if (!value) throw new Error(`${flag} requires a value.`);
  return value;
}

type FlagArgs = {
  positionals: string[];
  values: Map<string, string[]>;
  flags: Set<string>;
};

function parseFlagArgs(argv: string[], booleanFlags: Set<string>): FlagArgs {
  const positionals: string[] = [];
  const values = new Map<string, string[]>();
  const flags = new Set<string>();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }
    const name = arg.slice(2);
    if (booleanFlags.has(name)) {
      flags.add(name);
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined) throw new Error(`--${name} requires a value.`);
    index += 1;
    const existing = values.get(name) ?? [];
    existing.push(value);
    values.set(name, existing);
  }

  return { positionals, values, flags };
}

function firstValue(args: FlagArgs, name: string): string | undefined {
  return args.values.get(name)?.[0];
}

async function promptFor(question: string): Promise<string> {
  if (!process.stdin.isTTY) return "";
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(`${question} `)).trim();
  } finally {
    rl.close();
  }
}

async function requireOrPrompt(args: FlagArgs, flag: string, question: string): Promise<string> {
  const value = firstValue(args, flag);
  if (value) return value;
  const answer = await promptFor(question);
  if (!answer) throw new Error(`--${flag} requires a value.`);
  return answer;
}

function parseAuthFlag(raw: string): { type: ScaffoldAuthType; env: string } {
  const [type, env] = raw.split(":");
  if (!type || !env) throw new Error(`--auth expects <type>:<ENV_VAR>, got "${raw}".`);
  return { type: type as ScaffoldAuthType, env };
}

function parseRequestFlag(raw: string): { method: string; uriTemplate: string } {
  const separatorIndex = raw.indexOf(":");
  if (separatorIndex === -1) {
    throw new Error(`--request expects <METHOD>:<uriTemplate>, got "${raw}".`);
  }
  return {
    method: raw.slice(0, separatorIndex),
    uriTemplate: raw.slice(separatorIndex + 1),
  };
}

function parseSkillFlag(raw: string): { name: string; globs?: string[] } {
  const [name, globList] = raw.split(":");
  if (!name) throw new Error(`--skill expects <name>[:<glob,...>], got "${raw}".`);
  return { name, ...(globList ? { globs: globList.split(",").filter(Boolean) } : {}) };
}

function parseGrpcFlag(raw: string): { service: string; method: string } {
  const separatorIndex = raw.lastIndexOf(":");
  if (separatorIndex === -1) {
    throw new Error(`--grpc expects <service>:<method>, got "${raw}".`);
  }
  return {
    service: raw.slice(0, separatorIndex),
    method: raw.slice(separatorIndex + 1),
  };
}

function parseExposeFlag(raw: string): { from: string; name?: string } {
  const separatorIndex = raw.indexOf(":");
  if (separatorIndex === -1) return { from: raw };
  return { from: raw.slice(0, separatorIndex), name: raw.slice(separatorIndex + 1) };
}

function parseDenyFlag(raw: string): { from: string; reason: string } {
  const separatorIndex = raw.indexOf(":");
  if (separatorIndex === -1) throw new Error(`--deny-tool expects <from>:<reason>, got "${raw}".`);
  return { from: raw.slice(0, separatorIndex), reason: raw.slice(separatorIndex + 1) };
}

async function runScaffoldImporter(argv: string[], rootDir: string): Promise<void> {
  const args = parseFlagArgs(argv, new Set(["force"]));
  let name = args.positionals[0] ?? firstValue(args, "name");
  if (!name) name = await promptFor("Importer name (e.g. foo-2-mcp):");
  if (!name) throw new Error("scaffold importer requires a <name>.");

  let description = firstValue(args, "description");
  if (!description && process.stdin.isTTY) {
    description = (await promptFor("Description (optional):")) || undefined;
  }

  const result = await writeImporterScaffold({
    rootDir: firstValue(args, "root") ?? rootDir,
    name,
    description,
    force: args.flags.has("force"),
  });

  process.stdout.write(`Scaffolded ${result.files.length} files under ${result.dir}:\n`);
  for (const file of result.files) process.stdout.write(`  ${file}\n`);
}

async function runScaffoldManifest(argv: string[], rootDir: string): Promise<void> {
  const args = parseFlagArgs(argv, new Set(["force"]));
  const importer = args.positionals[0] ?? firstValue(args, "importer");
  if (!importer) throw new Error("scaffold manifest requires an <importer> engine name.");

  const name = await requireOrPrompt(args, "name", "Manifest name (e.g. ai.quickdeploy/example):");
  const sourceType = await requireOrPrompt(args, "source-type", "Source type (http|file|git|oci):");
  const sourceUri = await requireOrPrompt(args, "source-uri", "Source URI:");

  const requests = (args.values.get("request") ?? []).map(parseRequestFlag);
  const skills = (args.values.get("skill") ?? []).map(parseSkillFlag);
  const grpcMethods = (args.values.get("grpc") ?? []).map(parseGrpcFlag);
  const corpusGlobs = args.values.get("corpus-glob") ?? [];

  if (
    requests.length === 0 &&
    skills.length === 0 &&
    grpcMethods.length === 0 &&
    corpusGlobs.length === 0
  ) {
    const requestRaw = await promptFor(
      "Select at least one request as <METHOD>:<uriTemplate> (e.g. GET:/items/{id}):",
    );
    if (!requestRaw) {
      throw new Error(
        "scaffold manifest requires at least one --request, --skill, --grpc, or --corpus-glob.",
      );
    }
    requests.push(parseRequestFlag(requestRaw));
  }

  const transport = firstValue(args, "transport") as
    | ScaffoldManifestFileOptions["transport"]
    | undefined;

  const options: ScaffoldManifestFileOptions = {
    rootDir: firstValue(args, "root") ?? rootDir,
    importer,
    name,
    sourceType: sourceType as ScaffoldManifestFileOptions["sourceType"],
    sourceUri,
    ...(firstValue(args, "version") ? { version: firstValue(args, "version") } : {}),
    ...(firstValue(args, "version-range")
      ? { versionRange: firstValue(args, "version-range") }
      : {}),
    ...(firstValue(args, "title") ? { title: firstValue(args, "title") } : {}),
    ...(firstValue(args, "description") ? { description: firstValue(args, "description") } : {}),
    ...(firstValue(args, "source-ref") ? { sourceRef: firstValue(args, "source-ref") } : {}),
    ...(firstValue(args, "source-digest")
      ? { sourceDigest: firstValue(args, "source-digest") }
      : {}),
    ...(transport ? { transport } : {}),
    auth: (args.values.get("auth") ?? []).map(parseAuthFlag),
    requests,
    skills,
    grpcMethods,
    corpusGlobs,
    exposeTools: (args.values.get("expose-tool") ?? []).map(parseExposeFlag),
    exposeResources: (args.values.get("expose-resource") ?? []).map(parseExposeFlag),
    exposePrompts: (args.values.get("expose-prompt") ?? []).map(parseExposeFlag),
    denyTools: (args.values.get("deny-tool") ?? []).map(parseDenyFlag),
    ...(firstValue(args, "out") ? { outPath: firstValue(args, "out") } : {}),
  };

  const result = await writeScaffoldManifest(options);
  process.stdout.write(`Wrote ${result.manifest.metadata.name} manifest to ${result.path}.\n`);
}

async function runScaffold(argv: string[], rootDir: string): Promise<void> {
  const [subcommand, ...rest] = argv;
  if (subcommand === "importer") return runScaffoldImporter(rest, rootDir);
  if (subcommand === "manifest") return runScaffoldManifest(rest, rootDir);
  throw new Error(
    `Unknown scaffold subcommand: ${subcommand ?? "<none>"}. Use "importer" or "manifest".`,
  );
}

async function main(): Promise<void> {
  const rawArgv = process.argv.slice(2);
  if (rawArgv[0] === "scaffold") {
    await runScaffold(rawArgv.slice(1), findWorkspaceRoot(process.cwd()));
    return;
  }

  const {
    command,
    rootDir,
    check,
    importer,
    manifestPath,
    image,
    digest,
    bakedManifestPath,
    timeoutMs,
    serverJsonPath,
  } = readArgs(rawArgv);

  if (command === "config-schema") {
    if (!importer) throw new Error("config-schema requires --importer <engine>.");
    const schema = getImporterConfigSchema(importer);
    if (!schema) throw new Error(`No config schema is registered for importer ${importer}.`);
    process.stdout.write(`${JSON.stringify(schema, null, 2)}\n`);
    return;
  }

  if (command === "bake") {
    if (!manifestPath) throw new Error("bake requires --manifest <path>.");
    if (!image) throw new Error("bake requires --image <oci-image>.");
    if (!digest) throw new Error("bake requires --digest <sha256:digest>.");
    const serverJson = await compileBakedManifestFileToServerJson({
      rootDir,
      manifestPath,
      image,
      digest,
      ...(bakedManifestPath ? { bakedManifestPath } : {}),
    });
    process.stdout.write(`${JSON.stringify(serverJson, null, 2)}\n`);
    return;
  }

  if (command === "validate") {
    const result = await validateRegistryEntries({ rootDir });
    process.stdout.write(formatRegistryValidationViolations(result.violations));
    if (!result.ok) {
      throw new Error(
        `${result.violations.length} registry validation violation(s) found across ${result.entryCount} entries.`,
      );
    }
    process.stdout.write(`${result.entryCount} registry entries validated.\n`);
    return;
  }

  if (command === "validate-remotes") {
    const results = await validateRemoteLiveness({
      rootDir,
      ...(timeoutMs ? { timeoutMs } : {}),
      ...(serverJsonPath ? { serverJsonPath } : {}),
    });
    process.stdout.write(formatRemoteLivenessResults(results));
    const failures = failedRemoteLivenessResults(results);
    if (failures.length > 0) {
      throw new Error(`${failures.length} remote MCP endpoint(s) failed liveness validation.`);
    }
    return;
  }

  if (command !== "build") throw new Error(`Unknown command: ${command}`);

  if (check) {
    const result = await checkGeneratedRegistryArtifacts({ rootDir });
    if (!result.ok) {
      throw new Error(
        `Generated registry artifacts are stale: ${result.changed.join(", ")}. Run vp run build:registry -F @quickdeployai/registry-cli.`,
      );
    }
    process.stdout.write("Generated registry artifacts are current.\n");
    return;
  }

  const artifacts = await buildRegistryArtifacts({ rootDir });
  await writeRegistryArtifacts({ rootDir }, artifacts);
  process.stdout.write(
    `Wrote servers.json with ${artifacts.serversJson.servers.length} MCP entries.\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.stderr.write(`${usage()}\n`);
  process.exit(1);
});
