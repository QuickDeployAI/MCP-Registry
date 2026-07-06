#!/usr/bin/env node

import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type ValidationResult = {
  errors: string[];
  checkedServers: number;
};

type JsonObject = Record<string, unknown>;

type ServerManifest = JsonObject & {
  name?: unknown;
  version?: unknown;
  packages?: unknown;
};

type ServerPackage = JsonObject & {
  registryType?: unknown;
  identifier?: unknown;
  version?: unknown;
  digest?: unknown;
};

type RegistryIndex = JsonObject & {
  agents?: unknown;
};

type RegistryAgent = JsonObject & {
  id?: unknown;
  server?: unknown;
  summary?: unknown;
};

const EXACT_SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const OCI_DIGEST = /^sha256:[a-f0-9]{64}$/i;

export async function validateRepository(root: string): Promise<ValidationResult> {
  const errors: string[] = [];
  const absoluteRoot = resolve(root);
  const serverPaths = await discoverServerManifests(absoluteRoot);
  const registryIndex = await readOptionalJson<RegistryIndex>(join(absoluteRoot, "registry/index.json"));
  const agents = Array.isArray(registryIndex?.agents) ? (registryIndex.agents as RegistryAgent[]) : [];
  const agentsByServer = new Map<string, RegistryAgent>();

  for (const agent of agents) {
    if (typeof agent.server === "string") {
      agentsByServer.set(normalizePath(agent.server), agent);
    }
  }

  for (const serverPath of serverPaths) {
    await validateServerManifest(absoluteRoot, serverPath, agentsByServer, errors);
  }

  return {
    errors,
    checkedServers: serverPaths.length,
  };
}

async function validateServerManifest(
  root: string,
  serverPath: string,
  agentsByServer: Map<string, RegistryAgent>,
  errors: string[],
): Promise<void> {
  const relativeServerPath = normalizePath(relative(root, serverPath));
  const server = await readJson<ServerManifest>(serverPath);
  const serverLabel = typeof server.name === "string" ? server.name : relativeServerPath;
  const version = stringValue(server.version);

  if (!version || !EXACT_SEMVER.test(version)) {
    errors.push(`${relativeServerPath}: server version must be an exact semver version`);
  }

  const packageJsonPath = join(dirname(serverPath), "package.json");
  const packageJson = await readOptionalJson<JsonObject>(packageJsonPath);

  if (packageJson && typeof packageJson.version === "string" && version && packageJson.version !== version) {
    errors.push(`${relativeServerPath}: package.json version ${packageJson.version} does not match server.json ${version}`);
  }

  const packages = Array.isArray(server.packages) ? (server.packages as ServerPackage[]) : [];
  const npmPackage = packages.find((entry) => entry.registryType === "npm");

  if (packageJson && npmPackage && typeof packageJson.name === "string" && npmPackage.identifier !== packageJson.name) {
    errors.push(`${relativeServerPath}: npm package identifier ${String(npmPackage.identifier)} does not match ${packageJson.name}`);
  }

  for (const entry of packages) {
    validatePackageEntry(relativeServerPath, entry, version, errors);
  }

  const agent = agentsByServer.get(relativeServerPath);
  if (!agent) {
    errors.push(`${relativeServerPath}: registry/index.json is missing an agent entry`);
    return;
  }

  const summary = isObject(agent.summary) ? agent.summary : undefined;
  const summaryVersion = stringValue(summary?.version);

  if (version && summaryVersion !== version) {
    errors.push(`${relativeServerPath}: registry summary version ${String(summaryVersion)} does not match server.json ${version}`);
  }

  if (packageJson && summary && typeof packageJson.name === "string" && summary.package !== packageJson.name) {
    errors.push(`${relativeServerPath}: registry summary package ${String(summary.package)} does not match ${packageJson.name}`);
  }

  if (packages.length === 0) {
    errors.push(`${relativeServerPath}: ${serverLabel} must declare at least one package entry`);
  }
}

function validatePackageEntry(
  serverPath: string,
  entry: ServerPackage,
  serverVersion: string | undefined,
  errors: string[],
): void {
  const entryVersion = stringValue(entry.version);
  const identifier = stringValue(entry.identifier) ?? "<unknown>";

  if (!entryVersion || !EXACT_SEMVER.test(entryVersion)) {
    errors.push(`${serverPath}: package ${identifier} version must be an exact semver version`);
  }

  if (serverVersion && entryVersion && entryVersion !== serverVersion) {
    errors.push(`${serverPath}: package ${identifier} version ${entryVersion} does not match server.json ${serverVersion}`);
  }

  if (isOciPackage(entry)) {
    const digest = stringValue(entry.digest);

    if (!digest || !OCI_DIGEST.test(digest)) {
      errors.push(`${serverPath}: OCI package ${identifier} must record a sha256 digest`);
    }

    if (entryVersion && !identifier.endsWith(`:${entryVersion}`)) {
      errors.push(`${serverPath}: OCI package ${identifier} must be tagged with version ${entryVersion}`);
    }
  }
}

function isOciPackage(entry: ServerPackage): boolean {
  const registryType = stringValue(entry.registryType)?.toLowerCase();

  return registryType === "oci" || registryType === "docker" || registryType === "container";
}

async function discoverServerManifests(root: string): Promise<string[]> {
  const candidates = [join(root, "servers"), join(root, "packages/mcps")];
  const manifests: string[] = [];

  for (const candidate of candidates) {
    for (const child of await readDirectories(candidate)) {
      manifests.push(join(candidate, child, "server.json"));
    }
  }

  return manifests.sort();
}

async function readDirectories(path: string): Promise<string[]> {
  try {
    const entries = await readdir(path, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function readOptionalJson<T>(path: string): Promise<T | undefined> {
  try {
    return await readJson<T>(path);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return undefined;
    }

    throw error;
  }
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/");
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

export async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);

  if (command !== "validate") {
    console.error("Usage: registry-cli validate [--root <path>]");
    process.exitCode = 2;
    return;
  }

  const root = parseRoot(args);
  const result = await validateRepository(root);

  if (result.errors.length > 0) {
    console.error(`registry-cli validate failed with ${result.errors.length} error(s):`);
    for (const error of result.errors) {
      console.error(`- ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`registry-cli validate passed (${result.checkedServers} server manifest(s))`);
}

function parseRoot(args: string[]): string {
  const rootIndex = args.indexOf("--root");

  if (rootIndex >= 0) {
    const root = args[rootIndex + 1];
    return root ? resolve(root) : process.cwd();
  }

  return process.cwd();
}

const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? resolve(process.argv[1]) : "";

if (currentFile === invokedFile) {
  await main();
}
