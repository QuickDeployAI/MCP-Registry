export const GENERATED_MCP_SHARED_TOOLING_PATH = "packages/tools/registry-cli/src/codegen";
export const GENERATED_MCP_CODEGEN_ROOT = ".generated/mcp-codegen";
export const REGISTRY_INDEX_OUTPUT_PATH = "registry/index.json";
export const SERVERS_JSON_OUTPUT_PATH = "servers.json";

const IMPORTER_FAMILY_BY_ENGINE = {
  "openapi-2-mcp": "openapi",
  "asyncapi-2-mcp": "asyncapi",
  "grpc-2-mcp": "grpc",
  "wsdl-2-mcp": "wsdl",
  "feed-2-mcp": "feed",
} as const;

const FAMILY_SLUGS = new Set<string>(Object.values(IMPORTER_FAMILY_BY_ENGINE));

export type GeneratedMcpImporterEngine = keyof typeof IMPORTER_FAMILY_BY_ENGINE;
export type GeneratedMcpFamily = (typeof IMPORTER_FAMILY_BY_ENGINE)[GeneratedMcpImporterEngine];

export type GeneratedMcpWorkspaceInput = {
  readonly provider: string;
  readonly family: string;
  readonly capability: string;
};

export type GeneratedMcpWorkspacePaths = {
  readonly provider: string;
  readonly family: GeneratedMcpFamily;
  readonly capability: string;
  readonly manifestPath: string;
  readonly generatedTestPath: string;
  readonly codegenProjectPath: string;
  readonly sharedToolingPath: string;
};

export function generatedMcpWorkspacePaths(
  input: GeneratedMcpWorkspaceInput,
): GeneratedMcpWorkspacePaths {
  const provider = providerSlug(input.provider);
  const family = familySlug(input.family);
  const capability = capabilitySlug(input.capability);

  return {
    provider,
    family,
    capability,
    manifestPath: `registry/${provider}/${capability}.mcp.json`,
    generatedTestPath: `packages/tools/registry-cli/test/generated/${family}/${provider}.test.ts`,
    codegenProjectPath: `${GENERATED_MCP_CODEGEN_ROOT}/${family}/${provider}/`,
    sharedToolingPath: GENERATED_MCP_SHARED_TOOLING_PATH,
  };
}

export function providerSlug(value: string): string {
  return slugSegment(value, "provider");
}

export function capabilitySlug(value: string): string {
  return slugSegment(value.replace(/\.mcp\.json$/i, ""), "capability");
}

export function familySlug(value: string): GeneratedMcpFamily {
  const normalized = value.trim().toLowerCase();
  const family = IMPORTER_FAMILY_BY_ENGINE[normalized as GeneratedMcpImporterEngine] ?? normalized;
  if (FAMILY_SLUGS.has(family)) return family as GeneratedMcpFamily;
  throw new Error(
    `Unsupported generated MCP family "${value}". Expected one of ${[...FAMILY_SLUGS].join(", ")}.`,
  );
}

function slugSegment(value: string, label: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  if (!slug) {
    throw new Error(`Generated MCP ${label} slug must include at least one ASCII letter or number.`);
  }

  return slug;
}
