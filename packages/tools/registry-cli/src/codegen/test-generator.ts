import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  buildGeneratedMcpManifest,
  type GeneratedMcpManifestIntent,
  type GeneratedMcpManifestResult,
} from "./manifest-generator";
import { generatedMcpWorkspacePaths } from "./workspace-conventions";

export type GeneratedMcpTestFile = {
  readonly path: string;
  readonly text: string;
  readonly manifestPath: string;
  readonly manifest: GeneratedMcpManifestResult["manifest"];
};

export type WriteGeneratedMcpTestFileOptions = {
  readonly rootDir: string;
  readonly intent: GeneratedMcpManifestIntent;
};

export type WriteGeneratedMcpTestFileResult = GeneratedMcpTestFile & {
  readonly absolutePath: string;
};

export function buildGeneratedMcpTestFile(intent: GeneratedMcpManifestIntent): GeneratedMcpTestFile {
  const result = buildGeneratedMcpManifest(intent);
  const path = generatedMcpWorkspacePaths({
    provider: result.provider,
    family: result.family,
    capability: result.capability,
  }).generatedTestPath;
  const expected = {
    tools: result.manifest.spec.expose.tools,
    resources: result.manifest.spec.expose.resources,
    prompts: result.manifest.spec.expose.prompts,
    authEnvVars: authEnvironmentVariables(result.manifest),
    serverEnvVars: serverEnvironmentVariables(result.manifest),
  };

  return {
    path,
    manifestPath: result.manifestPath,
    manifest: result.manifest,
    text: renderGeneratedMcpTest({
      family: result.family,
      provider: result.provider,
      manifestPath: result.manifestPath,
      manifest: result.manifest,
      expected,
    }),
  };
}

export async function writeGeneratedMcpTestFile(
  options: WriteGeneratedMcpTestFileOptions,
): Promise<WriteGeneratedMcpTestFileResult> {
  const result = buildGeneratedMcpTestFile(options.intent);
  const absolutePath = resolve(options.rootDir, result.path);

  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, result.text, "utf8");

  return { ...result, absolutePath };
}

function renderGeneratedMcpTest(options: {
  readonly family: string;
  readonly provider: string;
  readonly manifestPath: string;
  readonly manifest: unknown;
  readonly expected: {
    readonly tools: readonly unknown[];
    readonly resources: readonly unknown[];
    readonly prompts: readonly unknown[];
    readonly authEnvVars: readonly string[];
    readonly serverEnvVars: readonly string[];
  };
}): string {
  return `import { describeGeneratedMcpManifest } from "../generated-test-helpers";

describeGeneratedMcpManifest({
  family: ${JSON.stringify(options.family)},
  provider: ${JSON.stringify(options.provider)},
  manifestPath: ${JSON.stringify(options.manifestPath)},
  manifest: ${stableJsonLiteral(options.manifest)},
  expected: ${stableJsonLiteral(options.expected)},
});
`;
}

function authEnvironmentVariables(manifest: GeneratedMcpManifestResult["manifest"]): string[] {
  const variables = new Set<string>();
  for (const auth of manifest.spec.auth) {
    switch (auth.type) {
      case "bearer":
        variables.add(auth.valueFrom.env);
        break;
      case "api-key":
        variables.add(auth.valueFrom.env);
        break;
      case "basic":
        variables.add(auth.usernameFrom.env);
        variables.add(auth.passwordFrom.env);
        break;
      case "oauth2":
        if (auth.valueFrom) variables.add(auth.valueFrom.env);
        if (auth.clientIdFrom) variables.add(auth.clientIdFrom.env);
        if (auth.clientSecretFrom) variables.add(auth.clientSecretFrom.env);
        break;
    }
  }
  const deploymentAuth = manifest.deployment.auth;
  if (
    (deploymentAuth?.type === "bearer" || deploymentAuth?.type === "oauth2-resource") &&
    deploymentAuth.tokenFrom
  ) {
    variables.add(deploymentAuth.tokenFrom.env);
  }
  return [...variables].sort((left, right) => left.localeCompare(right));
}

function serverEnvironmentVariables(manifest: GeneratedMcpManifestResult["manifest"]): string[] {
  const variables = new Set(authEnvironmentVariables(manifest));
  for (const variable of configSchemaEnvironmentVariables(manifest.spec.config?.schema)) {
    variables.add(variable);
  }
  for (const variable of configSchemaEnvironmentVariables(manifest.deployment.configSchema)) {
    variables.add(variable);
  }
  return [...variables].sort((left, right) => left.localeCompare(right));
}

function configSchemaEnvironmentVariables(schema: unknown): string[] {
  if (!isRecord(schema) || !isRecord(schema.properties)) return [];
  const required = new Set(Array.isArray(schema.required) ? schema.required : []);
  return Object.keys(schema.properties)
    .filter((property) => required.has(property))
    .map((property) => `QD_MANIFEST_${toEnvSegment(property)}`);
}

function toEnvSegment(value: string): string {
  const segment = value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
  return segment.length > 0 ? segment : "VALUE";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stableJsonLiteral(value: unknown): string {
  return JSON.stringify(value, null, 2)
    .split("\n")
    .map((line, index) => (index === 0 ? line : `  ${line}`))
    .join("\n");
}
