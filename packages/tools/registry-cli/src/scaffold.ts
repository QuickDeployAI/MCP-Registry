import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { stringify as stringifyYaml } from "yaml";
import {
  MCP_MANIFEST_API_VERSION,
  MCP_MANIFEST_KIND,
  McpManifestSchema,
  validateMcpManifestImporterConfig,
  type McpManifest,
  type McpManifestDeploymentAuth,
} from "@quickdeployai/registry-schemas";

export class ScaffoldError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScaffoldError";
  }
}

export type ScaffoldAuthType = "api-key" | "bearer" | "basic" | "oauth2";

export interface ScaffoldManifestAuth {
  type: ScaffoldAuthType;
  env: string;
}

export interface ScaffoldManifestRequest {
  method: string;
  uriTemplate: string;
}

export interface ScaffoldManifestSkill {
  name: string;
  globs?: string[];
}

export interface ScaffoldManifestGrpcMethod {
  service: string;
  method: string;
}

export interface ScaffoldExposeEntry {
  from: string;
  name?: string;
}

export interface ScaffoldDenyEntry {
  from: string;
  reason: string;
}

export interface ScaffoldManifestOptions {
  importer: string;
  name: string;
  version?: string;
  versionRange?: string;
  title?: string;
  description?: string;
  labels?: string[];
  sourceType: "http" | "file" | "git" | "oci";
  sourceUri: string;
  sourceRef?: string;
  sourceDigest?: string;
  transport?: "stdio" | "streamable-http" | "sse";
  auth?: ScaffoldManifestAuth[];
  requests?: ScaffoldManifestRequest[];
  skills?: ScaffoldManifestSkill[];
  grpcMethods?: ScaffoldManifestGrpcMethod[];
  corpusGlobs?: string[];
  exposeTools?: ScaffoldExposeEntry[];
  exposeResources?: ScaffoldExposeEntry[];
  exposePrompts?: ScaffoldExposeEntry[];
  denyTools?: ScaffoldDenyEntry[];
  configSchema?: Record<string, unknown>;
  configDefaults?: Record<string, unknown>;
  deploymentAuth?: McpManifestDeploymentAuth;
}

const QUICKDEPLOY_NAME_PREFIX = "ai.quickdeploy/";

function normalizeManifestName(name: string): string {
  return name.startsWith(QUICKDEPLOY_NAME_PREFIX) ? name : `${QUICKDEPLOY_NAME_PREFIX}${name}`;
}

function slugFromName(name: string): string {
  return normalizeManifestName(name)
    .slice(QUICKDEPLOY_NAME_PREFIX.length)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

type ManifestDraftSelect = {
  requests: Array<{ method: string; uriTemplate: string }>;
  grpcMethods: ScaffoldManifestGrpcMethod[];
  skills: Array<{ name: string; globs: string[] }>;
  corpusGlobs: string[];
};

function selectFromOptions(options: ScaffoldManifestOptions): ManifestDraftSelect {
  const requests = options.requests ?? [];
  const skills = options.skills ?? [];
  const grpcMethods = options.grpcMethods ?? [];
  const corpusGlobs = options.corpusGlobs ?? [];

  if (
    requests.length === 0 &&
    skills.length === 0 &&
    grpcMethods.length === 0 &&
    corpusGlobs.length === 0
  ) {
    throw new ScaffoldError(
      "scaffold manifest requires at least one selection: --request, --skill, --grpc, or --corpus-glob.",
    );
  }

  return {
    requests: requests.map((request) => ({
      method: request.method.toUpperCase(),
      uriTemplate: request.uriTemplate,
    })),
    grpcMethods,
    skills: skills.map((skill) => ({ name: skill.name, globs: skill.globs ?? [] })),
    corpusGlobs,
  };
}

type ManifestDraftExposeItem = { from: string; name?: string; deny?: boolean; reason?: string };
type ManifestDraftExpose = {
  tools: ManifestDraftExposeItem[];
  resources: ManifestDraftExposeItem[];
  prompts: ManifestDraftExposeItem[];
};

function exposeEntry(entry: ScaffoldExposeEntry): ManifestDraftExposeItem {
  return entry.name ? { from: entry.from, name: entry.name } : { from: entry.from };
}

function exposeFromOptions(options: ScaffoldManifestOptions): ManifestDraftExpose {
  const tools: ManifestDraftExposeItem[] = [
    ...(options.exposeTools ?? []).map(exposeEntry),
    ...(options.denyTools ?? []).map((entry) => ({
      from: entry.from,
      deny: true,
      reason: entry.reason,
    })),
  ];
  const resources = (options.exposeResources ?? []).map(exposeEntry);
  const prompts = (options.exposePrompts ?? []).map(exposeEntry);
  return { tools, resources, prompts };
}

/**
 * Builds a validated McpManifest from scaffold options. Every select/expose
 * shape mirrors the legacy mcp-host fixture examples; mcp-host derives tool names
 * for select.requests/grpcMethods automatically when expose.tools omits them,
 * so expose is only needed to rename or deny a generated tool.
 */
export function buildScaffoldManifest(options: ScaffoldManifestOptions): McpManifest {
  if (!options.sourceUri) throw new ScaffoldError("scaffold manifest requires a source URI.");
  if (!options.name) throw new ScaffoldError("scaffold manifest requires a manifest name.");

  const draft = {
    apiVersion: MCP_MANIFEST_API_VERSION,
    kind: MCP_MANIFEST_KIND,
    metadata: {
      name: normalizeManifestName(options.name),
      version: options.version ?? "0.1.0",
      ...(options.title ? { title: options.title } : {}),
      ...(options.description ? { description: options.description } : {}),
      labels: options.labels ?? [],
    },
    spec: {
      importer: {
        engine: options.importer,
        versionRange: options.versionRange ?? "^0.1.0",
      },
      source: {
        type: options.sourceType,
        uri: options.sourceUri,
        ...(options.sourceRef ? { ref: options.sourceRef } : {}),
        ...(options.sourceDigest ? { digest: options.sourceDigest } : {}),
      },
      select: selectFromOptions(options),
      auth: (options.auth ?? []).map((entry) => ({
        type: entry.type,
        valueFrom: { env: entry.env },
      })),
      ...(options.configSchema
        ? {
            config: {
              schema: options.configSchema,
              defaults: options.configDefaults ?? {},
            },
          }
        : {}),
      expose: exposeFromOptions(options),
    },
    deployment: {
      transport: options.transport ?? "streamable-http",
      auth: options.deploymentAuth ?? { type: "none" as const },
      userConfig: {},
    },
  };

  return McpManifestSchema.parse(draft);
}

export type ScaffoldManifestFormat = "yaml" | "json";

export interface ScaffoldManifestFileOptions extends ScaffoldManifestOptions {
  rootDir: string;
  outPath?: string;
  format?: ScaffoldManifestFormat;
}

export interface ScaffoldManifestResult {
  manifest: McpManifest;
  path: string;
  text: string;
  format: ScaffoldManifestFormat;
}

export function renderManifest(manifest: McpManifest, format: ScaffoldManifestFormat): string {
  if (format === "json") return `${JSON.stringify(manifest, null, 2)}\n`;
  return stringifyYaml(manifest, { lineWidth: 0 });
}

export function formatFromPath(path: string): ScaffoldManifestFormat {
  return path.endsWith(".json") ? "json" : "yaml";
}

/**
 * Writes a scaffolded manifest to disk. The manifest is validated twice:
 * once against the McpManifest JSON Schema (via McpManifestSchema) and once
 * against the importer's registered config schema, if any, via the same
 * validateMcpManifestImporterConfig() the registry build pipeline uses.
 */
export async function writeScaffoldManifest(
  options: ScaffoldManifestFileOptions,
): Promise<ScaffoldManifestResult> {
  const manifest = buildScaffoldManifest(options);
  validateMcpManifestImporterConfig(manifest);

  const outPath = resolve(
    options.rootDir,
    options.outPath ?? join("manifests", `${slugFromName(options.name)}.mcp.yaml`),
  );
  const format = options.format ?? formatFromPath(outPath);
  const text = renderManifest(manifest, format);

  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, text, "utf8");

  return { manifest, path: outPath, text, format };
}

export interface ScaffoldImporterOptions {
  name: string;
  description?: string;
}

export interface ScaffoldImporterFile {
  path: string;
  content: string;
}

function toPascalCase(name: string): string {
  return name
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function toEnvPrefix(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
}

const IMPORTER_NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

/**
 * Builds the file set for a new packages/importers/<name> package. The
 * generated package follows the pure-library convention every hardened
 * importer in this repo uses (openapi-2-mcp, postman-2-mcp, wsdl-2-mcp):
 * export tool builders on top of @quickdeployai/importer-core auth, no
 * standalone binary. mcp-host's engine adapters call into these builders;
 * a package only needs its own bin/dist once it stops fitting that shape.
 */
export function buildImporterScaffoldFiles(
  options: ScaffoldImporterOptions,
): ScaffoldImporterFile[] {
  if (!IMPORTER_NAME_PATTERN.test(options.name)) {
    throw new ScaffoldError(
      `Importer name "${options.name}" must be lowercase alphanumeric with hyphens (e.g. foo-2-mcp).`,
    );
  }

  const pascalName = toPascalCase(options.name);
  const envPrefix = toEnvPrefix(options.name);
  const description =
    options.description ?? `${options.name} importer utilities on the QuickDeploy baseline.`;

  const packageJson = {
    name: `@quickdeployai/${options.name}`,
    version: "0.1.0",
    private: true,
    description,
    files: ["src", "README.md"],
    type: "module",
    sideEffects: false,
    exports: {
      ".": {
        types: "./src/index.ts",
        import: "./src/index.ts",
        default: "./src/index.ts",
      },
    },
    scripts: {
      typecheck: "tsc --noEmit",
      test: "vitest run",
      build: "tsc --noEmit",
    },
    dependencies: {
      "@quickdeployai/importer-core": "workspace:*",
    },
    devDependencies: {
      "@types/node": "^22.0.0",
      typescript: "^5.8.3",
      vitest: "^4.1.9",
    },
    engines: {
      node: ">=22.18",
    },
  };

  const tsconfig = {
    compilerOptions: {
      target: "ES2022",
      lib: ["ES2022", "DOM"],
      module: "ESNext",
      moduleResolution: "bundler",
      moduleDetection: "force",
      isolatedModules: true,
      allowImportingTsExtensions: true,
      noEmit: true,
      skipLibCheck: true,
      useDefineForClassFields: true,
      strict: true,
    },
    include: ["src"],
  };

  const indexTs = `import { readEnvCredential, type ResolvedCredential } from "@quickdeployai/importer-core/auth";

/**
 * Replace this file's example tool with real tools derived from the source
 * this importer reads. See packages/importers/openapi-2-mcp/src/index.ts
 * for the pattern this scaffold follows.
 */

export type ${pascalName}AuthConfig =
  | {
      type: "bearer" | "oauth2" | "basic";
      valueFrom: { env: string };
    }
  | {
      type: "api-key";
      valueFrom: { env: string };
      name: string;
      in: "header" | "query" | "cookie";
    };

export type ${pascalName}Source = {
  name: string;
};

export type ${pascalName}Tool = {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  execute: (input: Record<string, unknown>) => Promise<string>;
};

export type Build${pascalName}ToolsOptions = {
  auth?: readonly ${pascalName}AuthConfig[];
  env?: NodeJS.ProcessEnv;
};

export function build${pascalName}Tools(
  source: ${pascalName}Source,
  options: Build${pascalName}ToolsOptions = {},
): ${pascalName}Tool[] {
  resolveCredentials(options.auth ?? [], options.env ?? process.env);

  return [
    {
      name: "ping",
      description: "Example tool generated by registry-cli scaffold importer. Replace with real tools.",
      inputSchema: {
        type: "object",
        properties: {
          message: { type: "string" },
        },
      },
      execute: async (input) =>
        JSON.stringify({ pong: input.message ?? source.name }, null, 2),
    },
  ];
}

function resolveCredentials(
  auth: readonly ${pascalName}AuthConfig[],
  env: NodeJS.ProcessEnv,
): ResolvedCredential[] {
  return auth.map((credential) => readEnvCredential(credential, env));
}
`;

  const indexTestTs = `import { describe, expect, it } from "vitest";
import { build${pascalName}Tools } from "./index";

describe("${options.name} package", () => {
  it("builds the example tool and resolves env-backed auth", async () => {
    const [tool] = build${pascalName}Tools(
      { name: "demo" },
      {
        auth: [{ type: "bearer", valueFrom: { env: "${envPrefix}_TOKEN" } }],
        env: { ${envPrefix}_TOKEN: "secret-token" },
      },
    );

    expect(tool?.name).toBe("ping");
    expect(await tool?.execute({ message: "hi" })).toContain("hi");
  });

  it("fails before startup when a required auth env var is missing", () => {
    expect(() =>
      build${pascalName}Tools(
        { name: "demo" },
        {
          auth: [{ type: "bearer", valueFrom: { env: "${envPrefix}_TOKEN" } }],
          env: {},
        },
      ),
    ).toThrow(/${envPrefix}_TOKEN/);
  });
});
`;

  const readme = `# @quickdeployai/${options.name}

${description}

Generated by \`registry-cli scaffold importer ${options.name}\`. Replace the
example \`ping\` tool in \`src/index.ts\` with tools derived from the real
source shape this importer reads, following the pattern in
\`packages/importers/openapi-2-mcp\`.

\`\`\`bash
vp run typecheck -F @quickdeployai/${options.name}
vp run test -F @quickdeployai/${options.name}
\`\`\`

Next steps:

1. Replace \`${pascalName}Source\` and \`build${pascalName}Tools\` with real parsing
   and tool-building logic.
2. If this importer needs runtime config, add a JSON Schema constant next to
   \`IMPORTER_CONFIG_SCHEMAS\` in
   \`packages/schemas/registry-schemas/src/mcp-manifest.ts\` so
   \`registry-cli config-schema --importer ${options.name}\` and manifest
   config validation both pick it up.
3. Add an engine adapter in \`packages/runtime/mcp-host/src/runtime.ts\`'s
   \`defaultEngines\` once this importer is ready to run under \`mcp-host\`.
 4. For committed registry publication, create an ARD entry plus projection config
    (see \`docs/registry/ard-projection-authoring-guide.md\`).
`;

  const dockerfile = `# Reference Dockerfile for running this importer's checks in isolation.
# Build from the repository root:
#   docker build -f packages/importers/${options.name}/Dockerfile -t ${options.name}-check .
FROM node:22-slim AS check
RUN corepack enable
WORKDIR /repo

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json ./
COPY packages/core/importer-core ./packages/core/importer-core
COPY packages/importers/${options.name} ./packages/importers/${options.name}

RUN pnpm install --frozen-lockfile --ignore-scripts --filter "@quickdeployai/${options.name}..."
CMD ["pnpm", "--filter", "@quickdeployai/${options.name}", "run", "typecheck", "&&", "pnpm", "--filter", "@quickdeployai/${options.name}", "run", "test"]
`;

  const base = `packages/importers/${options.name}`;
  return [
    { path: `${base}/package.json`, content: `${JSON.stringify(packageJson, null, 2)}\n` },
    { path: `${base}/tsconfig.json`, content: `${JSON.stringify(tsconfig, null, 2)}\n` },
    { path: `${base}/src/index.ts`, content: indexTs },
    { path: `${base}/src/index.test.ts`, content: indexTestTs },
    { path: `${base}/README.md`, content: readme },
    { path: `${base}/Dockerfile`, content: dockerfile },
  ];
}

export interface WriteImporterScaffoldOptions extends ScaffoldImporterOptions {
  rootDir: string;
  force?: boolean;
}

export interface WriteImporterScaffoldResult {
  dir: string;
  files: string[];
}

export async function writeImporterScaffold(
  options: WriteImporterScaffoldOptions,
): Promise<WriteImporterScaffoldResult> {
  const files = buildImporterScaffoldFiles(options);
  const written: string[] = [];

  for (const file of files) {
    const absolutePath = resolve(options.rootDir, file.path);
    if (!options.force && (await fileExists(absolutePath))) {
      throw new ScaffoldError(
        `${relative(options.rootDir, absolutePath)} already exists. Pass --force to overwrite.`,
      );
    }
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, file.content, "utf8");
    written.push(relative(options.rootDir, absolutePath));
  }

  return {
    dir: resolve(options.rootDir, `packages/importers/${options.name}`),
    files: written,
  };
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await readFile(path);
    return true;
  } catch {
    return false;
  }
}
