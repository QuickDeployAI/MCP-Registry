import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative, sep } from "node:path";
import { parse as parseYaml } from "yaml";
import {
  credentialBindingsFromMcpAuth,
  credentialEnvironmentVariables,
} from "@quickdeployai/importer-core";
import {
  OFFICIAL_MCP_SERVER_SCHEMA_2025_12_11,
  QUICKDEPLOY_REGISTRY_CURATION_META_KEY,
  QUICKDEPLOY_REGISTRY_MANIFEST_META_KEY,
  type McpManifest,
  McpManifestSchema,
  type ServersJsonEnvelope,
  ServersJsonEnvelopeSchema,
  OfficialServerJsonDocumentSchema,
  attachMcpManifestToServerJson,
  type OfficialServerJsonDocument,
  validateMcpManifestImporterConfig,
} from "@quickdeployai/registry-schemas";

const SERVERS_JSON_SCHEMA = "https://quickdeploy.ai/schemas/servers-json.schema.json";
const MCP_HOST_IMAGE = "ghcr.io/quickdeployai/mcp-host";
const MANIFEST_CONFIG_ENV_PREFIX = "QD_MANIFEST";
const DEFAULT_BAKED_MANIFEST_PATH = "/app/manifest.mcp.yaml";
const OCI_SHA256_DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/i;

export interface RegistryBuildOptions {
  rootDir: string;
}

export interface RegistryBuildArtifacts {
  serversJson: ServersJsonEnvelope;
  files: {
    "servers.json": string;
  };
}

export interface BakedManifestServerJsonOptions {
  sourceManifestPath: string;
  image: string;
  digest: string;
  bakedManifestPath?: string;
}

export interface BakedManifestFileOptions {
  rootDir: string;
  manifestPath: string;
  image: string;
  digest: string;
  bakedManifestPath?: string;
}

interface DiscoveredJson {
  path: string;
  value: unknown;
}

type OciImageDigestMap = Map<string, string>;

export async function buildRegistryArtifacts(
  options: RegistryBuildOptions,
): Promise<RegistryBuildArtifacts> {
  const sourceServers = await discoverPackageServerJson(options.rootDir);
  const remoteServers = await discoverRemoteServerJson(options.rootDir);
  const manifestServers = await discoverManifestServerJson(options.rootDir);
  const imageDigests = await readOciImageDigests(options.rootDir);
  const servers = applyOciDigestPins(
    [...sourceServers, ...remoteServers, ...manifestServers],
    imageDigests,
  ).sort((left, right) => left.name.localeCompare(right.name));

  const parsed = ServersJsonEnvelopeSchema.parse({
    $schema: SERVERS_JSON_SCHEMA,
    servers,
    _meta: {
      "ai.quickdeploy.registry/generatedBy": "@quickdeployai/registry-cli",
      "ai.quickdeploy.registry/sourceCount": servers.length,
    },
  });
  return {
    serversJson: parsed,
    files: {
      "servers.json": stableJson(parsed),
    },
  };
}

export async function writeRegistryArtifacts(
  options: RegistryBuildOptions,
  artifacts?: RegistryBuildArtifacts,
): Promise<void> {
  const artifactsToWrite = artifacts ?? (await buildRegistryArtifacts(options));
  for (const [path, contents] of Object.entries(artifactsToWrite.files)) {
    const target = join(options.rootDir, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, contents, "utf8");
  }
}

export async function checkGeneratedRegistryArtifacts(options: RegistryBuildOptions): Promise<{
  ok: boolean;
  changed: string[];
}> {
  const artifacts = await buildRegistryArtifacts(options);
  const changed: string[] = [];

  for (const [path, expected] of Object.entries(artifacts.files)) {
    const actual = await readFile(join(options.rootDir, path), "utf8").catch(() => "");
    if (actual !== expected) changed.push(path);
  }

  return { ok: changed.length === 0, changed };
}

async function discoverPackageServerJson(rootDir: string): Promise<OfficialServerJsonDocument[]> {
  const roots = [join(rootDir, "servers"), join(rootDir, "packages", "importers")];
  const files = (
    await Promise.all(roots.map((root) => findFiles(root, (name) => name === "server.json")))
  ).flat();
  const parsed = await Promise.all(files.map(readJson));
  return parsed.map(({ value, path }) => parseServerJson(value, path));
}

async function readOciImageDigests(rootDir: string): Promise<OciImageDigestMap> {
  const path = join(rootDir, "registry", "oci-image-digests.json");
  const raw = await readFile(path, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (raw === null) return new Map();

  const value = JSON.parse(raw) as unknown;
  if (!isRecord(value) || !isRecord(value.images)) return new Map();

  const digests = new Map<string, string>();
  for (const [image, digest] of Object.entries(value.images)) {
    if (typeof digest === "string" && /^sha256:[a-f0-9]{64}$/i.test(digest)) {
      digests.set(image, digest.toLowerCase());
    }
  }
  return digests;
}

function applyOciDigestPins(
  servers: OfficialServerJsonDocument[],
  digests: OciImageDigestMap,
): OfficialServerJsonDocument[] {
  if (digests.size === 0) return servers;

  return servers.map((server) => ({
    ...server,
    packages: server.packages?.map((pkg) => {
      if (pkg.registryType.toLowerCase() !== "oci" || !pkg.identifier) return pkg;
      const image = stripOciDigest(pkg.identifier);
      const digest = digests.get(pkg.identifier) ?? digests.get(image);
      if (!digest) return pkg;
      return {
        ...pkg,
        identifier: `${stripImageTag(image)}@${digest}`,
      };
    }),
  }));
}

async function discoverRemoteServerJson(rootDir: string): Promise<OfficialServerJsonDocument[]> {
  const remoteDir = join(rootDir, "manifests", "remotes");
  const files = await findFiles(
    remoteDir,
    (name) => !name.startsWith("_") && name.endsWith(".server.json"),
  );
  const parsed = await Promise.all(files.map(readJson));
  return parsed.map(({ value, path }) => parseServerJson(value, path));
}

async function discoverManifestServerJson(
  rootDir: string,
): Promise<OfficialServerJsonDocument[]> {
  const manifestDir = join(rootDir, "manifests");
  const files = await findFiles(manifestDir, (name, path) => {
    if (path.split(sep).includes("remotes")) return false;
    return isMcpManifestFileName(name);
  });

  const manifests = await Promise.all(files.map((path) => readManifest(rootDir, path)));
  return manifests.map(({ manifest, relativePath }) =>
    compileManifestToServerJson(manifest, relativePath),
  );
}

export function compileManifestToServerJson(
  manifest: unknown,
  relativePath: string,
): OfficialServerJsonDocument {
  const normalizedRelativePath = normalizePath(relativePath);
  const parsedManifest = parseManifestForRegistry(manifest, normalizedRelativePath);
  return compileMcpRuntimeServerJson(parsedManifest, {
    runtimeConfigPath: normalizedRelativePath,
    sourcePath: normalizedRelativePath,
    curationTags: ["manifest-backed", ...parsedManifest.metadata.labels],
    meta: {
      [QUICKDEPLOY_REGISTRY_MANIFEST_META_KEY]: parsedManifest,
    },
  });
}

function compileMcpRuntimeServerJson(
  parsedManifest: McpManifest,
  options: {
    runtimeConfigPath: string;
    sourcePath: string;
    curationTags: string[];
    meta: Record<string, unknown>;
  },
): OfficialServerJsonDocument {
  const envVars = manifestEnvironmentVariables(parsedManifest);
  const server = {
    $schema: OFFICIAL_MCP_SERVER_SCHEMA_2025_12_11,
    name: parsedManifest.metadata.name,
    version: parsedManifest.metadata.version,
    description: parsedManifest.metadata.description ?? parsedManifest.metadata.title,
    packages: [
      {
        registryType: "oci",
        identifier: MCP_HOST_IMAGE,
        runtimeHint: "mcp-host",
        transport: parsedManifest.deployment.transport,
        runtimeArguments: [
          "run",
          options.runtimeConfigPath,
          "--transport",
          parsedManifest.deployment.transport,
        ],
        ...(envVars.length > 0
          ? { environmentVariables: envVars.map((variable) => variable.name) }
          : {}),
      },
    ],
    ...(envVars.length > 0 ? { environmentVariables: envVars } : {}),
    _meta: {
      [QUICKDEPLOY_REGISTRY_CURATION_META_KEY]: {
        verifiedStatus: "review",
        category: parsedManifest.spec.importer.engine,
        isOfficial: true,
        tags: uniqueStrings(options.curationTags),
      },
      ...options.meta,
    },
  };

  return parseServerJson(server, options.sourcePath);
}

export function compileBakedManifestToServerJson(
  manifest: unknown,
  options: BakedManifestServerJsonOptions,
): OfficialServerJsonDocument {
  const sourceManifestPath = normalizePath(options.sourceManifestPath);
  const bakedManifestPath = options.bakedManifestPath ?? DEFAULT_BAKED_MANIFEST_PATH;
  const digest = normalizeOciDigest(options.digest);
  const parsedManifest = parseManifestForRegistry(manifest, sourceManifestPath);
  const envVars = manifestEnvironmentVariables(parsedManifest);
  const server = attachMcpManifestToServerJson(
    {
      $schema: OFFICIAL_MCP_SERVER_SCHEMA_2025_12_11,
      name: parsedManifest.metadata.name,
      version: parsedManifest.metadata.version,
      description: parsedManifest.metadata.description ?? parsedManifest.metadata.title,
      packages: [
        {
          registryType: "oci",
          identifier: `${options.image}@${digest}`,
          version: parsedManifest.metadata.version,
          runtimeHint: "mcp-host",
          transport: parsedManifest.deployment.transport,
          runtimeArguments: [
            "run",
            bakedManifestPath,
            "--transport",
            parsedManifest.deployment.transport,
          ],
          ...(envVars.length > 0
            ? { environmentVariables: envVars.map((variable) => variable.name) }
            : {}),
        },
      ],
      ...(envVars.length > 0 ? { environmentVariables: envVars } : {}),
      _meta: {
        [QUICKDEPLOY_REGISTRY_CURATION_META_KEY]: {
          verifiedStatus: "review",
          category: parsedManifest.spec.importer.engine,
          isOfficial: true,
          tags: uniqueStrings(["manifest-backed", "baked-oci", ...parsedManifest.metadata.labels]),
        },
        "ai.quickdeploy.registry/bake": {
          sourceManifestPath,
          bakedManifestPath,
          image: options.image,
          digest,
          runtime: "mcp-host",
        },
      },
    },
    parsedManifest,
  );

  return parseServerJson(server, sourceManifestPath);
}

export async function compileBakedManifestFileToServerJson(
  options: BakedManifestFileOptions,
): Promise<OfficialServerJsonDocument> {
  const manifestPath = normalizePath(options.manifestPath);
  const { manifest } = await readManifest(options.rootDir, join(options.rootDir, manifestPath));
  return compileBakedManifestToServerJson(manifest, {
    sourceManifestPath: manifestPath,
    image: options.image,
    digest: options.digest,
    ...(options.bakedManifestPath ? { bakedManifestPath: options.bakedManifestPath } : {}),
  });
}

export function extractManifestFromServerJson(serverJson: unknown): McpManifest {
  const parsedServer = parseServerJson(serverJson, "server.json");
  return McpManifestSchema.parse(parsedServer._meta?.[QUICKDEPLOY_REGISTRY_MANIFEST_META_KEY]);
}

function manifestEnvironmentVariables(
  manifest: McpManifest,
): Array<{ name: string; description: string; isRequired: boolean; isSecret: boolean }> {
  const variables = new Map<
    string,
    { name: string; description: string; isRequired: boolean; isSecret: boolean }
  >();

  for (const auth of manifest.spec.auth) {
    for (const variable of credentialEnvironmentVariables(credentialBindingsFromMcpAuth([auth]))) {
      variables.set(variable.name, {
        name: variable.name,
        description: `Secret used by ${auth.type} upstream authentication.`,
        isRequired: true,
        isSecret: true,
      });
    }
  }

  const inboundAuth = manifest.deployment.auth;
  if (inboundAuth?.type === "bearer" && inboundAuth.tokenFrom) {
    variables.set(inboundAuth.tokenFrom.env, {
      name: inboundAuth.tokenFrom.env,
      description: "Bearer token required by the hosted MCP endpoint.",
      isRequired: true,
      isSecret: true,
    });
  }
  if (inboundAuth?.type === "oauth2-resource" && inboundAuth.tokenFrom) {
    variables.set(inboundAuth.tokenFrom.env, {
      name: inboundAuth.tokenFrom.env,
      description: "OAuth access token accepted by the hosted MCP endpoint.",
      isRequired: true,
      isSecret: true,
    });
  }

  for (const variable of configSchemaEnvironmentVariables(manifest.spec.config?.schema)) {
    variables.set(variable.name, variable);
  }
  for (const variable of configSchemaEnvironmentVariables(manifest.deployment.configSchema)) {
    variables.set(variable.name, variable);
  }

  return [...variables.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function configSchemaEnvironmentVariables(
  schema: unknown,
): Array<{ name: string; description: string; isRequired: boolean; isSecret: boolean }> {
  if (!isRecord(schema) || !isRecord(schema.properties)) return [];
  const required = new Set(Array.isArray(schema.required) ? schema.required : []);

  return Object.entries(schema.properties)
    .filter(([property]) => required.has(property))
    .map(([property, propertySchema]) => ({
      name: `${MANIFEST_CONFIG_ENV_PREFIX}_${toEnvSegment(property)}`,
      description: schemaPropertyDescription(property, propertySchema),
      isRequired: true,
      isSecret: schemaPropertyIsSecret(propertySchema),
    }));
}

function schemaPropertyDescription(property: string, schema: unknown): string {
  if (isRecord(schema) && typeof schema.description === "string" && schema.description.trim()) {
    return schema.description;
  }
  return `Manifest config value for ${property}.`;
}

function schemaPropertyIsSecret(schema: unknown): boolean {
  if (!isRecord(schema)) return false;
  if (schema.isSecret === true || schema.secret === true || schema.writeOnly === true) return true;
  if (schema["x-secret"] === true || schema["x-quickdeploy-secret"] === true) return true;
  return schema.format === "password";
}

function parseServerJson(value: unknown, path: string): OfficialServerJsonDocument {
  const parsed = OfficialServerJsonDocumentSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(`Invalid server.json source ${path}: ${parsed.error.message}`);
  }
  return parsed.data;
}

async function readJson(path: string): Promise<DiscoveredJson> {
  return { path, value: JSON.parse(await readFile(path, "utf8")) };
}

async function readManifest(
  rootDir: string,
  path: string,
): Promise<{ manifest: McpManifest; relativePath: string }> {
  const raw = await readFile(path, "utf8");
  const value = extname(path) === ".json" ? JSON.parse(raw) : parseYaml(raw);
  const relativePath = normalizePath(relative(rootDir, path));
  return {
    manifest: parseManifestForRegistry(value, relativePath),
    relativePath,
  };
}

function parseManifestForRegistry(manifest: unknown, relativePath: string): McpManifest {
  try {
    return validateMcpManifestImporterConfig(manifest);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid importer config in ${relativePath}: ${message}`);
  }
}

async function findFiles(
  dir: string,
  predicate: (name: string, path: string) => boolean,
): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return [];
      throw error;
    },
  );
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return findFiles(path, predicate);
      if (entry.isFile() && predicate(entry.name, path)) return [path];
      return [];
    }),
  );
  return files
    .flat()
    .sort((left, right) => normalizePath(left).localeCompare(normalizePath(right)));
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim()))].sort((left, right) =>
    left.localeCompare(right),
  );
}

function normalizePath(path: string): string {
  return path.split(sep).join("/");
}

function isMcpManifestFileName(name: string): boolean {
  return name.endsWith(".mcp.json") || name.endsWith(".mcp.yaml") || name.endsWith(".mcp.yml");
}

function stripOciDigest(identifier: string): string {
  return identifier.split("@sha256:")[0] ?? identifier;
}

function stripImageTag(identifier: string): string {
  const slashIndex = identifier.lastIndexOf("/");
  const colonIndex = identifier.lastIndexOf(":");
  if (colonIndex > slashIndex) return identifier.slice(0, colonIndex);
  return identifier;
}

function toEnvSegment(value: string): string {
  const segment = value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
  return segment.length > 0 ? segment : "VALUE";
}

function normalizeOciDigest(digest: string): string {
  const normalized = digest.trim().toLowerCase();
  if (!OCI_SHA256_DIGEST_PATTERN.test(normalized)) {
    throw new Error("OCI image digest must be sha256:<64 hex characters>.");
  }
  return normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stableJson(value: unknown): string {
  return compactShortStringArrays(`${JSON.stringify(value, null, 2)}\n`);
}

function compactShortStringArrays(json: string): string {
  const lines = json.split("\n");
  const output: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const start = /^(\s*(?:"[^"]+": )?)\[$/.exec(line);
    if (!start) {
      output.push(line);
      continue;
    }

    const prefix = start[1] ?? "";
    const itemIndent = `${line.match(/^\s*/)?.[0] ?? ""}  `;
    const items: string[] = [];
    let cursor = index + 1;
    while (cursor < lines.length) {
      const item = new RegExp(`^${escapeRegExp(itemIndent)}(".*")(?:,)?$`).exec(
        lines[cursor] ?? "",
      );
      if (!item) break;
      items.push(item[1] ?? "");
      cursor += 1;
    }

    const end = new RegExp(`^${escapeRegExp(line.match(/^\s*/)?.[0] ?? "")}\\](,?)$`).exec(
      lines[cursor] ?? "",
    );
    const inline = `${prefix}[${items.join(", ")}]${end?.[1] ?? ""}`;
    if (items.length > 0 && items.length <= 4 && end && inline.length <= 100) {
      output.push(inline);
      index = cursor;
      continue;
    }

    output.push(line);
  }

  return output.join("\n");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
