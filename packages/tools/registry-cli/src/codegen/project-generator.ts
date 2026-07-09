import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, posix, resolve } from "node:path";
import type { McpManifest } from "@quickdeployai/registry-schemas";
import {
  GENERATED_MCP_POLICY_META_KEY,
  GENERATED_MCP_SOURCE_META_KEY,
  renderGeneratedMcpManifest,
} from "./manifest-generator";
import {
  generatedMcpWorkspacePaths,
  importerEngineForFamily,
  type GeneratedMcpFamily,
} from "./workspace-conventions";

export const GENERATED_MCP_IMPORTER_PACKAGE_BY_FAMILY = {
  openapi: "@quickdeployai/openapi-2-mcp",
  asyncapi: "@quickdeployai/asyncapi-2-mcp",
  grpc: "@quickdeployai/grpc-2-mcp",
  wsdl: "@quickdeployai/wsdl-2-mcp",
  feed: "@quickdeployai/feed-2-mcp",
} as const satisfies Record<GeneratedMcpFamily, string>;

export type GeneratedMcpCodegenProjectFile = {
  readonly path: string;
  readonly contents: string;
};

export type GeneratedMcpSourceFixture = {
  readonly path: string;
  readonly contents: string;
};

export type BuildGeneratedMcpCodegenProjectOptions = {
  readonly rootDir: string;
  readonly manifest: McpManifest;
  readonly manifestPath: string;
  readonly provider: string;
  readonly family: GeneratedMcpFamily;
  readonly capability: string;
  readonly generatedTestPath?: string;
  readonly sourceFixtures?: readonly GeneratedMcpSourceFixture[];
};

export type GeneratedMcpCodegenProject = {
  readonly provider: string;
  readonly family: GeneratedMcpFamily;
  readonly capability: string;
  readonly manifestPath: string;
  readonly generatedTestPath: string;
  readonly projectPath: string;
  readonly absoluteProjectPath: string;
  readonly importerPackage: string;
  readonly files: readonly GeneratedMcpCodegenProjectFile[];
};

export type WriteGeneratedMcpCodegenProjectOptions =
  BuildGeneratedMcpCodegenProjectOptions & {
    readonly clean?: boolean;
  };

export type WriteGeneratedMcpCodegenProjectResult = GeneratedMcpCodegenProject & {
  readonly writtenFiles: readonly string[];
};

export function buildGeneratedMcpCodegenProject(
  options: BuildGeneratedMcpCodegenProjectOptions,
): GeneratedMcpCodegenProject {
  const paths = generatedMcpWorkspacePaths({
    provider: options.provider,
    family: options.family,
    capability: options.capability,
  });
  const projectPath = paths.codegenProjectPath;
  const absoluteProjectPath = resolve(options.rootDir, stripTrailingSlash(projectPath));
  const generatedTestPath = options.generatedTestPath ?? paths.generatedTestPath;
  const importerPackage = GENERATED_MCP_IMPORTER_PACKAGE_BY_FAMILY[paths.family];
  const files: GeneratedMcpCodegenProjectFile[] = [
    {
      path: "package.json",
      contents: jsonText(packageJsonForProject({ ...options, importerPackage })),
    },
    {
      path: "tsconfig.json",
      contents: jsonText(tsconfigForProject()),
    },
    {
      path: "manifest.mcp.json",
      contents: renderGeneratedMcpManifest(options.manifest),
    },
    {
      path: "source-metadata.json",
      contents: jsonText(sourceMetadataForProject({ ...options, generatedTestPath })),
    },
    {
      path: "runtime-policy.json",
      contents: jsonText(runtimePolicyForProject({ ...options, projectPath, generatedTestPath })),
    },
    {
      path: "src/index.ts",
      contents: runtimeEntrypointForProject({ ...options, importerPackage }),
    },
    {
      path: "test/generated-project.test.ts",
      contents: generatedProjectTestForProject({ ...options, importerPackage }),
    },
    {
      path: "README.md",
      contents: readmeForProject({ ...options, projectPath, importerPackage, generatedTestPath }),
    },
    ...sourceFixtureFiles(options.sourceFixtures ?? []),
  ];

  return {
    provider: paths.provider,
    family: paths.family,
    capability: paths.capability,
    manifestPath: options.manifestPath,
    generatedTestPath,
    projectPath,
    absoluteProjectPath,
    importerPackage,
    files,
  };
}

export async function writeGeneratedMcpCodegenProject(
  options: WriteGeneratedMcpCodegenProjectOptions,
): Promise<WriteGeneratedMcpCodegenProjectResult> {
  const project = buildGeneratedMcpCodegenProject(options);
  if (options.clean) {
    await rm(project.absoluteProjectPath, { recursive: true, force: true });
  }

  const writtenFiles: string[] = [];
  for (const file of project.files) {
    assertRelativeProjectPath(file.path);
    const absolutePath = join(project.absoluteProjectPath, file.path);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, file.contents, "utf8");
    writtenFiles.push(absolutePath);
  }

  return { ...project, writtenFiles };
}

function packageJsonForProject(options: {
  family: GeneratedMcpFamily;
  provider: string;
  importerPackage: string;
}): Record<string, unknown> {
  return {
    name: `@quickdeployai/generated-mcp-${options.family}-${options.provider}`,
    version: "0.0.0",
    private: true,
    type: "module",
    description: `Generated ${options.family} MCP codegen project for ${options.provider}.`,
    scripts: {
      build: "tsc -p tsconfig.json --noEmit",
      test: "vitest run --testTimeout=30000 test/generated-project.test.ts",
    },
    dependencies: {
      "@quickdeployai/mcp-host": "workspace:*",
      "@quickdeployai/registry-schemas": "workspace:*",
      [options.importerPackage]: "workspace:*",
    },
    devDependencies: {
      "@types/node": "catalog:",
      typescript: "catalog:",
      vitest: "catalog:",
    },
  };
}

function tsconfigForProject(): Record<string, unknown> {
  return {
    compilerOptions: {
      target: "ES2022",
      lib: ["ES2022"],
      module: "ESNext",
      moduleResolution: "bundler",
      moduleDetection: "force",
      isolatedModules: true,
      strict: true,
      allowImportingTsExtensions: true,
      noEmit: true,
      skipLibCheck: true,
      types: ["node", "vitest"],
    },
    include: ["src", "test"],
  };
}

function sourceMetadataForProject(options: {
  manifest: McpManifest;
  manifestPath: string;
  generatedTestPath: string;
}): Record<string, unknown> {
  const sourceMeta =
    options.manifest.spec.config?.[GENERATED_MCP_SOURCE_META_KEY] ??
    options.manifest._meta?.[GENERATED_MCP_SOURCE_META_KEY] ??
    null;

  return {
    manifestPath: options.manifestPath,
    generatedTestPath: options.generatedTestPath,
    importer: options.manifest.spec.importer,
    source: options.manifest.spec.source,
    sourceMetadata: sourceMeta,
    pinned: {
      digest: options.manifest.spec.source.digest ?? null,
      ref: options.manifest.spec.source.ref ?? null,
      retrievedAt:
        isRecord(sourceMeta) && typeof sourceMeta.retrievedAt === "string"
          ? sourceMeta.retrievedAt
          : null,
      sourceVersion:
        isRecord(sourceMeta) && typeof sourceMeta.sourceVersion === "string"
          ? sourceMeta.sourceVersion
          : null,
    },
  };
}

function runtimePolicyForProject(options: {
  manifest: McpManifest;
  projectPath: string;
  manifestPath: string;
  generatedTestPath: string;
}): Record<string, unknown> {
  return {
    execution: "openshell-mxc-only",
    unavailableRuntime: "fail-closed",
    directHostExecution: "forbidden",
    projectPath: options.projectPath,
    manifestPath: options.manifestPath,
    generatedTestPath: options.generatedTestPath,
    build: { command: "pnpm run build" },
    test: { command: "pnpm run test" },
    manifestPolicy:
      options.manifest.spec.config?.[GENERATED_MCP_POLICY_META_KEY] ??
      options.manifest._meta?.[GENERATED_MCP_POLICY_META_KEY] ??
      null,
  };
}

function runtimeEntrypointForProject(options: {
  manifest: McpManifest;
  provider: string;
  family: GeneratedMcpFamily;
  capability: string;
  importerPackage: string;
}): string {
  return `import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { McpManifestSchema, validateMcpManifestImporterConfig } from "@quickdeployai/registry-schemas";

export const generatedProject = ${JSON.stringify(
    {
      provider: options.provider,
      family: options.family,
      capability: options.capability,
      importer: importerEngineForFamily(options.family),
      importerPackage: options.importerPackage,
      mcpHostPackage: "@quickdeployai/mcp-host",
      manifestName: options.manifest.metadata.name,
      execution: "openshell-mxc-only",
    },
    null,
    2,
  )} as const;

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

export function loadGeneratedManifest() {
  const raw = readFileSync(join(root, "manifest.mcp.json"), "utf8");
  return validateMcpManifestImporterConfig(McpManifestSchema.parse(JSON.parse(raw)));
}
`;
}

function generatedProjectTestForProject(options: {
  manifest: McpManifest;
  importerPackage: string;
}): string {
  return `import { describe, expect, it } from "vitest";
import { generatedProject, loadGeneratedManifest } from "../src/index";

describe("generated MCP project", () => {
  it("loads the committed manifest through the generated runtime entrypoint", () => {
    const manifest = loadGeneratedManifest();
    expect(manifest.metadata.name).toBe(${JSON.stringify(options.manifest.metadata.name)});
    expect(manifest.spec.importer.engine).toBe(${JSON.stringify(options.manifest.spec.importer.engine)});
    expect(generatedProject.importerPackage).toBe(${JSON.stringify(options.importerPackage)});
    expect(generatedProject.execution).toBe("openshell-mxc-only");
  });
});
`;
}

function readmeForProject(options: {
  manifest: McpManifest;
  projectPath: string;
  manifestPath: string;
  generatedTestPath: string;
  importerPackage: string;
}): string {
  return `# ${options.manifest.metadata.title ?? options.manifest.metadata.name}

Generated MCP codegen project for \`${options.manifest.metadata.name}\`.

## Layout

- Project path: \`${options.projectPath}\`
- Manifest copy: \`manifest.mcp.json\`
- Source metadata: \`source-metadata.json\`
- Runtime policy notes: \`runtime-policy.json\`
- Runtime entrypoint: \`src/index.ts\`
- Generated project test: \`test/generated-project.test.ts\`

## Source Of Truth

- Committed manifest: \`${options.manifestPath}\`
- Committed generated tests: \`${options.generatedTestPath}\`
- Importer package: \`${options.importerPackage}\`
- Host runtime package: \`@quickdeployai/mcp-host\`

Generated project build and test commands are intended for the OpenShell/MXC
sandbox harness only. Do not execute generated provider code directly on the
host. Failing generated artifacts are preserved by default so provider agents
can inspect this directory after a red test run.
`;
}

function sourceFixtureFiles(
  fixtures: readonly GeneratedMcpSourceFixture[],
): GeneratedMcpCodegenProjectFile[] {
  return fixtures.map((fixture) => {
    assertRelativeProjectPath(fixture.path);
    const path = posix.join("fixtures", fixture.path);
    assertRelativeProjectPath(path);
    return {
      path,
      contents: fixture.contents,
    };
  });
}

function jsonText(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/g, "");
}

function assertRelativeProjectPath(path: string): void {
  if (path.startsWith("/") || path.split(/[\\/]+/).includes("..")) {
    throw new Error(`Generated project file path must stay inside the project: ${path}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
