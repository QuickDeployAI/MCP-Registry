import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  MCP_MANIFEST_API_VERSION,
  MCP_MANIFEST_KIND,
  McpManifestSchema,
  validateMcpManifestImporterConfig,
  type McpManifest,
  type McpManifestAuth,
  type McpManifestDeploymentAuth,
  type McpManifestRequestSelect,
  type McpManifestSource,
} from "@quickdeployai/registry-schemas";
import {
  capabilitySlug,
  generatedMcpWorkspacePaths,
  importerEngineForFamily,
  providerSlug,
  type GeneratedMcpFamily,
  type GeneratedMcpImporterEngine,
} from "./workspace-conventions";

export const GENERATED_MCP_SOURCE_META_KEY = "ai.quickdeploy.codegen/source";
export const GENERATED_MCP_POLICY_META_KEY = "ai.quickdeploy.codegen/policy";

type GeneratedMcpJsonSchema = {
  type?: string;
  properties?: Record<string, unknown>;
  required?: string[];
  [key: string]: unknown;
};

type GeneratedMcpExposeItem = {
  readonly from: string;
  readonly name?: string;
  readonly deny?: boolean;
  readonly reason?: string;
};

export type GeneratedMcpSourceMetadata = {
  readonly retrievedAt?: string;
  readonly sourceVersion?: string;
  readonly notes?: readonly string[];
};

export type GeneratedMcpRuntimePolicy = {
  readonly network: readonly string[];
  readonly filesystem: readonly string[];
  readonly process: readonly string[];
  readonly generatedExecution: "openshell-mxc-only";
  readonly unavailableRuntime: "fail-closed";
};

export type GeneratedMcpConfigInput = {
  readonly schema?: GeneratedMcpJsonSchema;
  readonly defaults?: Record<string, unknown>;
};

export type GeneratedMcpExposeInput = {
  readonly tools?: readonly GeneratedMcpExposeItem[];
  readonly resources?: readonly GeneratedMcpExposeItem[];
  readonly prompts?: readonly GeneratedMcpExposeItem[];
};

export type GeneratedMcpManifestIntent = {
  readonly provider: string;
  readonly family: GeneratedMcpFamily | GeneratedMcpImporterEngine;
  readonly capability?: string;
  readonly serverName?: string;
  readonly version?: string;
  readonly importerVersionRange?: string;
  readonly title?: string;
  readonly description?: string;
  readonly labels?: readonly string[];
  readonly source: McpManifestSource;
  readonly sourceMetadata?: GeneratedMcpSourceMetadata;
  readonly select: {
    readonly requests?: readonly McpManifestRequestSelect[];
    readonly grpcMethods?: readonly { readonly service: string; readonly method: string }[];
    readonly corpusGlobs?: readonly string[];
  };
  readonly auth?: readonly McpManifestAuth[];
  readonly config?: GeneratedMcpConfigInput;
  readonly expose?: GeneratedMcpExposeInput;
  readonly deployment?: {
    readonly transport?: "stdio" | "streamable-http" | "sse";
    readonly auth?: McpManifestDeploymentAuth;
    readonly userConfig?: Record<string, GeneratedMcpJsonSchema>;
    readonly configSchema?: GeneratedMcpJsonSchema;
  };
  readonly policy?: GeneratedMcpRuntimePolicy;
};

export type GeneratedMcpManifestResult = {
  readonly manifest: McpManifest;
  readonly manifestPath: string;
  readonly provider: string;
  readonly family: GeneratedMcpFamily;
  readonly capability: string;
};

export type WriteGeneratedMcpManifestOptions = {
  readonly rootDir: string;
  readonly intent: GeneratedMcpManifestIntent;
};

export type WriteGeneratedMcpManifestResult = GeneratedMcpManifestResult & {
  readonly path: string;
  readonly text: string;
};

export function buildGeneratedMcpManifest(
  intent: GeneratedMcpManifestIntent,
): GeneratedMcpManifestResult {
  const family = generatedFamily(intent.family);
  const provider = providerSlug(intent.provider);
  const capability = capabilitySlug(intent.capability ?? defaultCapabilityForFamily(family));
  const engine = importerEngineForFamily(family);
  const paths = generatedMcpWorkspacePaths({ provider, family, capability });
  const config = configFromIntent(intent);

  assertNoLiteralSecrets(intent.config?.defaults ?? {});

  const draft = {
    apiVersion: MCP_MANIFEST_API_VERSION,
    kind: MCP_MANIFEST_KIND,
    metadata: {
      name: normalizeServerName(intent.serverName ?? provider),
      version: intent.version ?? "0.1.0",
      title: intent.title ?? titleFromProvider(provider),
      description:
        intent.description ?? `Generated ${engine} MCP manifest for ${titleFromProvider(provider)}.`,
      labels: uniqueStrings(["generated", family, provider, ...(intent.labels ?? [])]),
    },
    spec: {
      importer: {
        engine,
        versionRange: intent.importerVersionRange ?? "^0.1.0",
      },
      source: intent.source,
      select: {
        requests: (intent.select.requests ?? []).map((request) => ({
          method: request.method.toUpperCase(),
          uriTemplate: request.uriTemplate,
        })),
        grpcMethods: [...(intent.select.grpcMethods ?? [])],
        corpusGlobs: [...(intent.select.corpusGlobs ?? [])],
      },
      auth: [...(intent.auth ?? [])],
      config,
      expose: exposeFromIntent(intent, provider, family),
    },
    deployment: {
      transport: intent.deployment?.transport ?? "streamable-http",
      auth: intent.deployment?.auth ?? { type: "none" as const },
      userConfig: intent.deployment?.userConfig ?? {},
      ...(intent.deployment?.configSchema ? { configSchema: intent.deployment.configSchema } : {}),
    },
  };

  return {
    manifest: validateMcpManifestImporterConfig(McpManifestSchema.parse(draft)),
    manifestPath: paths.manifestPath,
    provider,
    family,
    capability,
  };
}

export function renderGeneratedMcpManifest(manifest: McpManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export async function writeGeneratedMcpManifest(
  options: WriteGeneratedMcpManifestOptions,
): Promise<WriteGeneratedMcpManifestResult> {
  const result = buildGeneratedMcpManifest(options.intent);
  const text = renderGeneratedMcpManifest(result.manifest);
  const path = resolve(options.rootDir, result.manifestPath);

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text, "utf8");

  return { ...result, path, text };
}

function generatedFamily(value: GeneratedMcpFamily | GeneratedMcpImporterEngine): GeneratedMcpFamily {
  return generatedMcpWorkspacePaths({
    provider: "family-check",
    family: value,
    capability: "api",
  }).family;
}

function configFromIntent(intent: GeneratedMcpManifestIntent): Record<string, unknown> {
  return {
    schema: intent.config?.schema,
    defaults: intent.config?.defaults ?? {},
    [GENERATED_MCP_SOURCE_META_KEY]: {
      uri: intent.source.uri,
      type: intent.source.type,
      ...(intent.source.digest ? { digest: intent.source.digest } : {}),
      ...(intent.source.ref ? { ref: intent.source.ref } : {}),
      ...(intent.sourceMetadata?.retrievedAt ? { retrievedAt: intent.sourceMetadata.retrievedAt } : {}),
      ...(intent.sourceMetadata?.sourceVersion
        ? { sourceVersion: intent.sourceMetadata.sourceVersion }
        : {}),
      ...(intent.sourceMetadata?.notes ? { notes: [...intent.sourceMetadata.notes] } : {}),
    },
    [GENERATED_MCP_POLICY_META_KEY]: intent.policy ?? defaultGeneratedMcpRuntimePolicy(),
  };
}

function exposeFromIntent(
  intent: GeneratedMcpManifestIntent,
  provider: string,
  family: GeneratedMcpFamily,
): {
  tools: GeneratedMcpExposeItem[];
  resources: GeneratedMcpExposeItem[];
  prompts: GeneratedMcpExposeItem[];
} {
  if (intent.expose) {
    return {
      tools: normalizeExposeItems(intent.expose.tools ?? []),
      resources: normalizeExposeItems(intent.expose.resources ?? []),
      prompts: normalizeExposeItems(intent.expose.prompts ?? []),
    };
  }

  if (family === "feed") {
    return {
      tools: [{ from: "feed.query", name: `query_${toIdentifier(provider)}_feed`, deny: false }],
      resources: [{ from: "feed:item", name: `${toIdentifier(provider)}_feed_item`, deny: false }],
      prompts: [],
    };
  }

  return {
    tools: [
      ...(intent.select.requests ?? []).map((request) => ({
        from: `${request.method.toUpperCase()} ${request.uriTemplate}`,
        name: toIdentifier(`${request.method} ${request.uriTemplate}`),
        deny: false,
      })),
      ...(intent.select.grpcMethods ?? []).map((method) => ({
        from: `${method.service}/${method.method}`,
        name: toIdentifier(`${method.service} ${method.method}`),
        deny: false,
      })),
    ],
    resources: [],
    prompts: [],
  };
}

function normalizeExposeItems(items: readonly GeneratedMcpExposeItem[]): GeneratedMcpExposeItem[] {
  return items.map((item) => ({ ...item, deny: item.deny ?? false }));
}

function defaultGeneratedMcpRuntimePolicy(): GeneratedMcpRuntimePolicy {
  return {
    network: ["source-uri", "configured-upstream"],
    filesystem: ["generated-project-readwrite"],
    process: ["none"],
    generatedExecution: "openshell-mxc-only",
    unavailableRuntime: "fail-closed",
  };
}

function defaultCapabilityForFamily(family: GeneratedMcpFamily): string {
  if (family === "feed") return "feed";
  if (family === "grpc") return "proto";
  if (family === "wsdl") return "wsdl";
  if (family === "asyncapi") return "events";
  return "api";
}

function normalizeServerName(value: string): string {
  const prefix = "ai.quickdeploy/";
  return value.startsWith(prefix) ? value : `${prefix}${providerSlug(value)}`;
}

function titleFromProvider(provider: string): string {
  return provider
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function toIdentifier(value: string): string {
  const identifier = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_{2,}/g, "_");
  return identifier || "generated_tool";
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim()))].sort((left, right) =>
    left.localeCompare(right),
  );
}

function assertNoLiteralSecrets(defaults: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(defaults)) {
    if (isSecretLikeKey(key) && value !== undefined && value !== null && value !== "") {
      throw new Error(
        `Generated MCP config default "${key}" looks secret-like. Use spec.auth env refs instead.`,
      );
    }
    if (isRecord(value)) assertNoLiteralSecrets(value);
  }
}

function isSecretLikeKey(key: string): boolean {
  return /(?:api[_-]?key|secret|token|password|credential)/i.test(key);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
