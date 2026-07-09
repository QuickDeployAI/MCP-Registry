import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  McpManifestSchema,
  validateMcpManifestImporterConfig,
  type McpManifest,
  type McpManifestSource,
} from "@quickdeployai/registry-schemas";
import { compileManifestToServerJson } from "../registry-build";
import {
  buildGeneratedMcpManifest,
  type GeneratedMcpManifestIntent,
  type GeneratedMcpManifestResult,
} from "./manifest-generator";
import { generatedMcpWorkspacePaths, type GeneratedMcpFamily } from "./workspace-conventions";

export type GeneratedMcpExposeAssertion = {
  readonly from: string;
  readonly name?: string;
  readonly deny: false;
  readonly reason?: string;
};

export type GeneratedMcpEnvironmentVariable = {
  readonly name: string;
  readonly description: string;
  readonly isRequired: boolean;
  readonly isSecret: boolean;
};

export type GeneratedMcpTestExpectations = {
  readonly serverName: string;
  readonly source: McpManifestSource;
  readonly importer: {
    readonly engine: string;
    readonly versionRange: string;
  };
  readonly expose: {
    readonly tools: readonly GeneratedMcpExposeAssertion[];
    readonly resources: readonly GeneratedMcpExposeAssertion[];
    readonly prompts: readonly GeneratedMcpExposeAssertion[];
  };
  readonly environmentVariables: readonly GeneratedMcpEnvironmentVariable[];
};

export type GeneratedMcpTestSuiteModel = {
  readonly provider: string;
  readonly family: GeneratedMcpFamily;
  readonly capability: string;
  readonly manifestPath: string;
  readonly testPath: string;
  readonly manifest: McpManifest;
  readonly expectations: GeneratedMcpTestExpectations;
};

export type GeneratedMcpTestSuite = GeneratedMcpTestSuiteModel & {
  readonly text: string;
};

export type BuildGeneratedMcpTestSuiteOptions = GeneratedMcpManifestResult;

export type WriteGeneratedMcpTestSuiteOptions = {
  readonly rootDir: string;
  readonly manifest: GeneratedMcpManifestResult;
};

export type WriteGeneratedMcpTestSuiteResult = GeneratedMcpTestSuite & {
  readonly path: string;
};

export type GeneratedMcpTestFile = {
  readonly path: string;
  readonly text: string;
  readonly manifest: McpManifest;
};

export function buildGeneratedMcpTestSuite(
  options: BuildGeneratedMcpTestSuiteOptions,
): GeneratedMcpTestSuite {
  const manifest = validateMcpManifestImporterConfig(McpManifestSchema.parse(options.manifest));
  const paths = generatedMcpWorkspacePaths({
    provider: options.provider,
    family: options.family,
    capability: options.capability,
  });
  const server = compileManifestToServerJson(manifest, options.manifestPath);
  const model: GeneratedMcpTestSuiteModel = {
    provider: options.provider,
    family: options.family,
    capability: options.capability,
    manifestPath: options.manifestPath,
    testPath: paths.generatedTestPath,
    manifest,
    expectations: {
      serverName: manifest.metadata.name,
      source: manifest.spec.source,
      importer: {
        engine: manifest.spec.importer.engine,
        versionRange: manifest.spec.importer.versionRange,
      },
      expose: {
        tools: publicExpose(manifest.spec.expose.tools),
        resources: publicExpose(manifest.spec.expose.resources),
        prompts: publicExpose(manifest.spec.expose.prompts),
      },
      environmentVariables: (server.environmentVariables ?? []).map(generatedEnvironmentVariable),
    },
  };

  return { ...model, text: renderGeneratedMcpTestSuite(model) };
}

export function buildGeneratedMcpTestFile(intent: GeneratedMcpManifestIntent): GeneratedMcpTestFile {
  const suite = buildGeneratedMcpTestSuite(buildGeneratedMcpManifest(intent));
  return {
    path: suite.testPath,
    text: suite.text,
    manifest: suite.manifest,
  };
}

export function renderGeneratedMcpTestSuite(suite: GeneratedMcpTestSuiteModel): string {
  return `import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  QUICKDEPLOY_REGISTRY_MANIFEST_META_KEY,
  McpManifestSchema,
  validateMcpManifestImporterConfig,
} from "@quickdeployai/registry-schemas";
import { buildRegistryArtifacts, compileManifestToServerJson } from "../../../src/registry-build";

const FAMILY = ${JSON.stringify(suite.family)};
const PROVIDER = ${JSON.stringify(suite.provider)};
const CAPABILITY = ${JSON.stringify(suite.capability)};
const MANIFEST_PATH = ${JSON.stringify(suite.manifestPath)};
const MANIFEST = ${stableJsonLiteral(suite.manifest)} as const;
const EXPECTED = ${stableJsonLiteral(suite.expectations)} as const;

describe(\`generated MCP manifest contract: \${FAMILY}/\${PROVIDER}\`, () => {
  it("keeps the generated manifest schema-valid", () => {
    const manifest = parseManifest();

    expect(manifest.metadata.name).toBe(EXPECTED.serverName);
    expect(manifest.spec.source).toEqual(EXPECTED.source);
    expect(manifest.spec.importer).toMatchObject(EXPECTED.importer);
    expect(manifest.metadata.labels).toEqual(expect.arrayContaining(["generated", FAMILY, PROVIDER]));
    expect(manifest.spec.config).toEqual(MANIFEST.spec.config);
    expect(manifest._meta).toEqual(MANIFEST._meta);
  });

  it("matches manifest-selected tools, resources, prompts, and env vars", () => {
    const manifest = parseManifest();
    const server = compileManifestToServerJson(manifest, MANIFEST_PATH);

    expect(publicExpose(manifest.spec.expose.tools)).toEqual(EXPECTED.expose.tools);
    expect(publicExpose(manifest.spec.expose.resources)).toEqual(EXPECTED.expose.resources);
    expect(publicExpose(manifest.spec.expose.prompts)).toEqual(EXPECTED.expose.prompts);
    expect(server.environmentVariables ?? []).toEqual(EXPECTED.environmentVariables);
    expect(server.packages?.[0]?.environmentVariables ?? []).toEqual(expectedEnvironmentVariableNames());
  });

  it("compiles to the expected server.json entry shape", () => {
    const manifest = parseManifest();
    const server = compileManifestToServerJson(manifest, MANIFEST_PATH);

    expect(server.name).toBe(EXPECTED.serverName);
    expect(server.packages?.[0]).toMatchObject({
      registryType: "oci",
      identifier: "ghcr.io/quickdeployai/mcp-host",
      runtimeHint: "mcp-host",
      transport: manifest.deployment.transport,
      runtimeArguments: ["run", MANIFEST_PATH, "--transport", manifest.deployment.transport],
    });
    expect(server._meta?.[QUICKDEPLOY_REGISTRY_MANIFEST_META_KEY]).toEqual(manifest);
  });

  it("produces deterministic registry output", async () => {
    const manifest = parseManifest();
    const rootDir = await mkdtemp(join(tmpdir(), \`generated-mcp-\${PROVIDER}-\`));
    const targetPath = join(rootDir, MANIFEST_PATH);
    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(targetPath, \`\${JSON.stringify(manifest, null, 2)}\\n\`, "utf8");

    const first = await buildRegistryArtifacts({ rootDir });
    const second = await buildRegistryArtifacts({ rootDir });

    expect(second.files).toEqual(first.files);
    expect(second.generatedFiles).toEqual(first.generatedFiles);
    expect(first.serversJson.servers.map((server) => server.name)).toEqual([EXPECTED.serverName]);
    expect(first.indexJson.providers).toEqual([
      {
        id: PROVIDER,
        entries: [
          {
            kind: "mcp-manifest",
            name: EXPECTED.serverName,
            path: MANIFEST_PATH,
            version: manifest.metadata.version,
          },
        ],
      },
    ]);
  });
});

function parseManifest() {
  return validateMcpManifestImporterConfig(McpManifestSchema.parse(MANIFEST));
}

function expectedEnvironmentVariableNames(): string[] {
  return (EXPECTED.environmentVariables as readonly { readonly name: string }[]).map(
    (variable) => variable.name,
  );
}

function publicExpose(
  items: readonly { readonly from: string; readonly name?: string; readonly deny?: boolean; readonly reason?: string }[],
) {
  return items
    .filter((item) => !item.deny)
    .map((item) => ({
      from: item.from,
      ...(item.name ? { name: item.name } : {}),
      deny: false,
      ...(item.reason ? { reason: item.reason } : {}),
    }));
}
`;
}

export async function writeGeneratedMcpTestSuite(
  options: WriteGeneratedMcpTestSuiteOptions,
): Promise<WriteGeneratedMcpTestSuiteResult> {
  const suite = buildGeneratedMcpTestSuite(options.manifest);
  const path = resolve(options.rootDir, suite.testPath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, suite.text, "utf8");
  return { ...suite, path };
}

function publicExpose(
  items: readonly {
    readonly from: string;
    readonly name?: string;
    readonly deny?: boolean;
    readonly reason?: string;
  }[],
): GeneratedMcpExposeAssertion[] {
  return items
    .filter((item) => !item.deny)
    .map((item) => ({
      from: item.from,
      ...(item.name ? { name: item.name } : {}),
      deny: false,
      ...(item.reason ? { reason: item.reason } : {}),
    }));
}

function generatedEnvironmentVariable(variable: {
  readonly name: string;
  readonly description?: string;
  readonly isRequired?: boolean;
  readonly isSecret?: boolean;
}): GeneratedMcpEnvironmentVariable {
  if (
    typeof variable.description !== "string" ||
    typeof variable.isRequired !== "boolean" ||
    typeof variable.isSecret !== "boolean"
  ) {
    throw new Error(`Generated MCP server environment variable "${variable.name}" is incomplete.`);
  }
  return {
    name: variable.name,
    description: variable.description,
    isRequired: variable.isRequired,
    isSecret: variable.isSecret,
  };
}

function stableJsonLiteral(value: unknown): string {
  return JSON.stringify(value, null, 2);
}
