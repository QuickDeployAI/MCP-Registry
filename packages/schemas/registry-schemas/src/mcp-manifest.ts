import { z } from "zod";
import { ServerJsonPackageSchema } from "./servers-json.js";

export const MCP_MANIFEST_API_VERSION = "quickdeploy.ai/v1" as const;
export const MCP_MANIFEST_KIND = "McpManifest" as const;
export const MCP_MANIFEST_SCHEMA_ID =
  "https://schemas.quickdeploy.ai/mcp-manifest.v1.schema.json" as const;
export const QUICKDEPLOY_MCP_MANIFEST_META_KEY = "ai.quickdeploy.registry/manifest" as const;
export const QUICKDEPLOY_MCP_PROJECTION_META_KEY = "ai.quickdeploy.registry/projection" as const;
export const QUICKDEPLOY_ARD_ENTRY_META_KEY = "ai.quickdeploy.registry/ard-entry" as const;
export const OFFICIAL_MCP_SERVER_SCHEMA_2025_12_11 =
  "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json" as const;

const ExactVersionSchema = z
  .string()
  .regex(
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/,
    "version must be exact semver, not a range",
  );

const QuickDeployServerNameSchema = z
  .string()
  .min(3)
  .max(200)
  .regex(
    /^ai\.quickdeploy\/[a-zA-Z0-9._-]+$/,
    "name must use the ai.quickdeploy/<name> server namespace",
  );

const SourceUriSchema = z
  .string()
  .min(1)
  .regex(
    /^(https?:\/\/|file:\/\/|git\+https:\/\/|ssh:\/\/|oci:\/\/)[^\s]+$/,
    "source uri must be http(s), file, git+https, ssh, or oci",
  );

const EnvNameSchema = z
  .string()
  .regex(/^[A-Z_][A-Z0-9_]*$/, "environment variable names must be uppercase");

const JsonSchemaLikeSchema = z
  .object({
    type: z.string().optional(),
    properties: z.record(z.string(), z.unknown()).optional(),
    required: z.array(z.string()).optional(),
  })
  .catchall(z.unknown());

export const McpManifestMetadataSchema = z
  .object({
    name: QuickDeployServerNameSchema,
    version: ExactVersionSchema,
    title: z.string().min(1).max(100).optional(),
    description: z.string().min(1).max(100).optional(),
    labels: z.array(z.string().min(1)).default([]),
  })
  .strict();
export type McpManifestMetadata = z.infer<typeof McpManifestMetadataSchema>;

export const McpManifestImporterSchema = z
  .object({
    engine: z.string().min(1),
    mode: z.string().min(1).optional(),
    versionRange: z.string().min(1),
  })
  .strict();
export type McpManifestImporter = z.infer<typeof McpManifestImporterSchema>;

export const McpManifestSourceSchema = z
  .object({
    type: z.enum(["http", "file", "git", "oci"]),
    uri: SourceUriSchema,
    digest: z.string().min(1).optional(),
    ref: z.string().min(1).optional(),
  })
  .strict();
export type McpManifestSource = z.infer<typeof McpManifestSourceSchema>;

export const McpManifestRequestSelectSchema = z
  .object({
    method: z
      .string()
      .min(1)
      .transform((method) => method.toUpperCase()),
    uriTemplate: z.string().min(1),
  })
  .strict();
export type McpManifestRequestSelect = z.infer<typeof McpManifestRequestSelectSchema>;

export const McpManifestGrpcMethodSelectSchema = z
  .object({
    service: z.string().min(1),
    method: z.string().min(1),
  })
  .strict();

export const McpManifestPythonFunctionSelectSchema = z
  .string()
  .min(1)
  .regex(
    /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*\.(?:[A-Za-z_][A-Za-z0-9_]*|\*)$/,
    "python function selectors must use module.function or module.*",
  );

export const McpManifestSkillSelectSchema = z
  .object({
    name: z.string().min(1),
    globs: z.array(z.string().min(1)).default([]),
  })
  .strict();

export const McpManifestKnowledgeSourceSelectSchema = z
  .object({
    id: z.string().min(1),
    kind: z.string().min(1),
    config: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();

export const McpManifestSelectSchema = z
  .object({
    requests: z.array(McpManifestRequestSelectSchema).default([]),
    grpcMethods: z.array(McpManifestGrpcMethodSelectSchema).default([]),
    methods: z.array(z.string().min(1)).default([]),
    pythonFunctions: z.array(McpManifestPythonFunctionSelectSchema).default([]),
    skills: z.array(McpManifestSkillSelectSchema).default([]),
    knowledgeSources: z.array(McpManifestKnowledgeSourceSelectSchema).default([]),
    corpusGlobs: z.array(z.string().min(1)).default([]),
    workflows: z.array(z.string().min(1)).default([]),
  })
  .strict()
  .refine(
    (select) =>
      select.requests.length > 0 ||
      select.grpcMethods.length > 0 ||
      select.methods.length > 0 ||
      select.pythonFunctions.length > 0 ||
      select.skills.length > 0 ||
      select.knowledgeSources.length > 0 ||
      select.corpusGlobs.length > 0 ||
      select.workflows.length > 0,
    "select must include at least one request, gRPC method, JSON-RPC method, Python function, skill, knowledge source, corpus glob, or workflow",
  );
export type McpManifestSelect = z.infer<typeof McpManifestSelectSchema>;

const EnvValueFromSchema = z
  .object({
    env: EnvNameSchema,
  })
  .strict();

export const McpManifestAuthSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("bearer"),
      valueFrom: EnvValueFromSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("api-key"),
      in: z.enum(["header", "query"]).default("header"),
      name: z.string().min(1).default("x-api-key"),
      valueFrom: EnvValueFromSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("basic"),
      usernameFrom: EnvValueFromSchema,
      passwordFrom: EnvValueFromSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("oauth2"),
      valueFrom: EnvValueFromSchema.optional(),
      tokenUrl: z.string().url().optional(),
      clientIdFrom: EnvValueFromSchema.optional(),
      clientSecretFrom: EnvValueFromSchema.optional(),
      scopes: z.array(z.string().min(1)).optional(),
    })
    .strict()
    .refine(
      (auth) =>
        Boolean(auth.valueFrom) ||
        Boolean(auth.tokenUrl && auth.clientIdFrom && auth.clientSecretFrom),
      "oauth2 auth requires valueFrom or tokenUrl/clientIdFrom/clientSecretFrom",
    ),
]);
export type McpManifestAuth = z.infer<typeof McpManifestAuthSchema>;

const McpManifestInboundAuthHeaderSchema = z
  .object({
    name: z.string().min(1),
    value: z.string().min(1).optional(),
  })
  .strict();

export const McpManifestDeploymentAuthSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("none") }).strict(),
  z
    .object({
      type: z.literal("gateway"),
      authenticatedHeader: McpManifestInboundAuthHeaderSchema.default({
        name: "x-quickdeploy-gateway-authenticated",
        value: "true",
      }),
    })
    .strict(),
  z
    .object({
      type: z.literal("bearer"),
      tokenFrom: z.object({ env: EnvNameSchema }).strict().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("oauth2-resource"),
      resourceMetadataUrl: z.string().url(),
      audience: z.string().min(1).optional(),
      requiredScopes: z.array(z.string().min(1)).default([]),
      tokenFrom: z.object({ env: EnvNameSchema }).strict().optional(),
    })
    .strict(),
]);
export type McpManifestDeploymentAuth = z.infer<typeof McpManifestDeploymentAuthSchema>;

const ApiManifestExtensionSchema = z
  .object({
    extensions: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const ApiManifestPublisherSchema = z
  .object({
    name: z.string().min(1),
    contactEmail: z.string().email(),
  })
  .merge(ApiManifestExtensionSchema);
export type ApiManifestPublisher = z.infer<typeof ApiManifestPublisherSchema>;

export const ApiManifestAccessRequestSchema = z
  .object({
    type: z.string().min(1),
  })
  .catchall(z.unknown());
export type ApiManifestAccessRequest = z.infer<typeof ApiManifestAccessRequestSchema>;

export const ApiManifestAuthorizationRequirementsSchema = z
  .object({
    clientIdentifier: z.string().min(1).optional(),
    access: z
      .union([z.array(ApiManifestAccessRequestSchema).min(1), z.array(z.string().min(1)).min(1)])
      .optional(),
  })
  .merge(ApiManifestExtensionSchema);
export type ApiManifestAuthorizationRequirements = z.infer<
  typeof ApiManifestAuthorizationRequirementsSchema
>;

export const ApiManifestRequestInfoSchema = z
  .object({
    method: z
      .string()
      .min(1)
      .transform((method) => method.toUpperCase()),
    uriTemplate: z.string().min(1),
    dataClassification: z.array(z.string().min(1)).default([]),
  })
  .merge(ApiManifestExtensionSchema);
export type ApiManifestRequestInfo = z.infer<typeof ApiManifestRequestInfoSchema>;

export const ApiManifestDependencySchema = z
  .object({
    apiDescriptionUrl: z.string().url().optional(),
    apiDescriptionVersion: z.string().min(1).optional(),
    apiDeploymentBaseUrl: z.string().url().optional(),
    authorizationRequirements: ApiManifestAuthorizationRequirementsSchema.optional(),
    requests: z.array(ApiManifestRequestInfoSchema).min(1),
  })
  .merge(ApiManifestExtensionSchema);
export type ApiManifestDependency = z.infer<typeof ApiManifestDependencySchema>;

export const ApiManifestSchema = z
  .object({
    applicationName: z.string().min(1),
    publisher: ApiManifestPublisherSchema.optional(),
    apiDependencies: z.record(z.string().min(1), ApiManifestDependencySchema),
  })
  .merge(ApiManifestExtensionSchema);
export type ApiManifest = z.infer<typeof ApiManifestSchema>;

export const McpManifestConfigSchema = z
  .object({
    schema: JsonSchemaLikeSchema.optional(),
    defaults: z.record(z.string(), z.unknown()).default({}),
  })
  .catchall(z.unknown());
export type McpManifestConfig = z.infer<typeof McpManifestConfigSchema>;

export type ImporterConfigJsonSchema = {
  $id: string;
  $schema: "https://json-schema.org/draft/2020-12/schema";
  title: string;
  type: "object";
  additionalProperties: boolean;
  properties: Record<string, JsonSchemaLike>;
  required?: string[];
};

type JsonSchemaLike = z.infer<typeof JsonSchemaLikeSchema>;

export const OPENAPI_2_MCP_CONFIG_SCHEMA = {
  $id: "https://schemas.quickdeploy.ai/importers/openapi-2-mcp.config.schema.json",
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "openapi-2-mcp importer config",
  type: "object",
  additionalProperties: false,
  properties: {
    baseUrl: {
      type: "string",
      format: "uri",
      description: "Base URL override for the selected OpenAPI deployment.",
    },
    headers: {
      type: "object",
      description: "Static non-secret upstream headers. Secrets must use spec.auth.",
      additionalProperties: { type: "string" },
    },
    requestTimeoutMs: {
      type: "number",
      minimum: 1,
      description: "Per-request upstream timeout in milliseconds.",
    },
    mode: {
      type: "string",
      description: "Importer execution profile such as read-only or mutating.",
    },
    tenant: {
      type: "string",
      description: "QuickDeploy tenant or namespace used by hosted examples.",
    },
  },
} as const satisfies ImporterConfigJsonSchema;

export const ASYNCAPI_2_MCP_CONFIG_SCHEMA = {
  $id: "https://schemas.quickdeploy.ai/importers/asyncapi-2-mcp.config.schema.json",
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "asyncapi-2-mcp importer config",
  type: "object",
  additionalProperties: false,
  properties: {
    brokerProtocol: {
      type: "string",
      description: "AsyncAPI broker binding to use for generated tools, such as kafka or mqtt.",
    },
    bootstrapServers: {
      type: "array",
      description: "Kafka bootstrap servers used by generated publish tools.",
      items: { type: "string" },
    },
    clientId: {
      type: "string",
      description: "Broker client identifier used by generated publish or consume operations.",
    },
    topicOverrides: {
      type: "object",
      description: "Optional map from AsyncAPI channel name to broker topic.",
      additionalProperties: { type: "string" },
    },
    schemaRegistryUrl: {
      type: "string",
      format: "uri",
      description: "Optional schema registry used to resolve payload schemas.",
    },
    publishTimeoutMs: {
      type: "number",
      minimum: 1,
      description: "Per-publish timeout in milliseconds.",
    },
  },
} as const satisfies ImporterConfigJsonSchema;

export const FEED_2_MCP_CONFIG_SCHEMA = {
  $id: "https://schemas.quickdeploy.ai/importers/feed-2-mcp.config.schema.json",
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "feed-2-mcp importer config",
  type: "object",
  additionalProperties: false,
  properties: {
    refreshMinutes: {
      type: "number",
      minimum: 1,
      description: "Refresh interval for feed polling and cache updates.",
    },
    maxItems: {
      type: "number",
      minimum: 1,
      description: "Maximum feed items retained in the MCP corpus.",
    },
    includeContent: {
      type: "boolean",
      description: "Whether full feed content is exposed in resources.",
    },
  },
} as const satisfies ImporterConfigJsonSchema;

export const WSDL_2_MCP_CONFIG_SCHEMA = {
  $id: "https://schemas.quickdeploy.ai/importers/wsdl-2-mcp.config.schema.json",
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "wsdl-2-mcp importer config",
  type: "object",
  additionalProperties: false,
  properties: {
    endpoint: {
      type: "string",
      format: "uri",
      description: "SOAP endpoint override for the selected WSDL service port.",
    },
    bindingName: {
      type: "string",
      description: "Optional WSDL binding name when a document exposes multiple SOAP bindings.",
    },
    requestTimeoutMs: {
      type: "number",
      minimum: 1,
      description: "Per-request SOAP upstream timeout in milliseconds.",
    },
  },
} as const satisfies ImporterConfigJsonSchema;

export const POSTMAN_2_MCP_CONFIG_SCHEMA = {
  $id: "https://schemas.quickdeploy.ai/importers/postman-2-mcp.config.schema.json",
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "postman-2-mcp importer config",
  type: "object",
  additionalProperties: false,
  properties: {
    baseUrl: {
      type: "string",
      format: "uri",
      description: "Base URL override for Postman collection requests that use variables.",
    },
    variables: {
      type: "object",
      description: "Non-secret Postman variable overrides. Secret values must use spec.auth.",
      additionalProperties: { type: "string" },
    },
    requestTimeoutMs: {
      type: "number",
      minimum: 1,
      description: "Per-request upstream timeout in milliseconds.",
    },
  },
} as const satisfies ImporterConfigJsonSchema;

export const HAR_2_MCP_CONFIG_SCHEMA = {
  $id: "https://schemas.quickdeploy.ai/importers/har-2-mcp.config.schema.json",
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "har-2-mcp importer config",
  type: "object",
  additionalProperties: false,
  properties: {
    baseUrl: {
      type: "string",
      format: "uri",
      description: "Base URL used to replay reviewed HAR-derived operations.",
    },
    redactionPolicy: {
      type: "string",
      description: "Named redaction profile applied before generated requests are published.",
    },
    includeMethods: {
      type: "array",
      description: "HTTP methods allowed from the reviewed HAR capture.",
      items: { type: "string" },
    },
    requestTimeoutMs: {
      type: "number",
      minimum: 1,
      description: "Per-request upstream timeout in milliseconds.",
    },
  },
} as const satisfies ImporterConfigJsonSchema;

export const GRPC_2_MCP_CONFIG_SCHEMA = {
  $id: "https://schemas.quickdeploy.ai/importers/grpc-2-mcp.config.schema.json",
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "grpc-2-mcp importer config",
  type: "object",
  additionalProperties: false,
  properties: {
    endpoint: {
      type: "string",
      description: "gRPC host:port endpoint.",
    },
    protoPath: {
      type: "string",
      description: "Local proto file used by the runtime proxy.",
    },
    authority: {
      type: "string",
      description: "Optional TLS authority override.",
    },
    tls: {
      type: "boolean",
      description: "Whether the gRPC channel uses TLS.",
    },
    metadata: {
      type: "object",
      description: "Static non-secret gRPC metadata. Secrets must use spec.auth.",
      additionalProperties: { type: "string" },
    },
    requestTimeoutMs: {
      type: "number",
      minimum: 1,
      description: "Per-call timeout in milliseconds.",
    },
  },
} as const satisfies ImporterConfigJsonSchema;

export const OPENRPC_2_MCP_CONFIG_SCHEMA = {
  $id: "https://schemas.quickdeploy.ai/importers/openrpc-2-mcp.config.schema.json",
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "openrpc-2-mcp importer config",
  type: "object",
  additionalProperties: false,
  properties: {
    endpointUrl: {
      type: "string",
      format: "uri",
      description: "JSON-RPC endpoint used by generated OpenRPC tools.",
    },
    transport: {
      type: "string",
      enum: ["http", "ws"],
      description: "JSON-RPC transport: http or ws.",
    },
    paramStructure: {
      type: "string",
      enum: ["by-name", "by-position", "either"],
      description: "Default JSON-RPC parameter encoding when a method does not declare one.",
    },
    allowMethods: {
      type: "array",
      items: { type: "string" },
      uniqueItems: true,
      description: "Optional allow-list of JSON-RPC method names.",
    },
    denyMethods: {
      type: "array",
      items: { type: "string" },
      uniqueItems: true,
      description: "Optional deny-list of JSON-RPC method names.",
    },
    headers: {
      type: "object",
      description: "Static non-secret JSON-RPC headers. Secrets must use spec.auth.",
      additionalProperties: { type: "string" },
    },
    requestTimeoutMs: {
      type: "number",
      minimum: 1,
      description: "Per-call JSON-RPC timeout in milliseconds.",
    },
  },
  required: ["endpointUrl"],
} as const satisfies ImporterConfigJsonSchema;

export const ARAZZO_2_MCP_CONFIG_SCHEMA = {
  $id: "https://schemas.quickdeploy.ai/importers/arazzo-2-mcp.config.schema.json",
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "arazzo-2-mcp importer config",
  type: "object",
  additionalProperties: false,
  properties: {
    sourceOverrides: {
      type: "object",
      description: "Base URL overrides keyed by Arazzo sourceDescription name.",
      additionalProperties: { type: "string", format: "uri" },
    },
    workflowAllowlist: {
      type: "array",
      description: "Workflow IDs to expose as tools. Omit to expose all workflows.",
      items: { type: "string", minLength: 1 },
      uniqueItems: true,
    },
    stepTimeoutMs: {
      type: "integer",
      minimum: 1,
      description: "Maximum execution time for one workflow step in milliseconds.",
    },
    maxSteps: {
      type: "integer",
      minimum: 1,
      description: "Maximum number of workflow steps, including retries, per execution.",
    },
  },
} as const satisfies ImporterConfigJsonSchema;

const IMPORTER_CONFIG_SCHEMAS: Record<string, ImporterConfigJsonSchema> = {
  "openapi-2-mcp": OPENAPI_2_MCP_CONFIG_SCHEMA,
  "asyncapi-2-mcp": ASYNCAPI_2_MCP_CONFIG_SCHEMA,
  "openrpc-2-mcp": OPENRPC_2_MCP_CONFIG_SCHEMA,
  "feed-2-mcp": FEED_2_MCP_CONFIG_SCHEMA,
  "wsdl-2-mcp": WSDL_2_MCP_CONFIG_SCHEMA,
  "postman-2-mcp": POSTMAN_2_MCP_CONFIG_SCHEMA,
  "har-2-mcp": HAR_2_MCP_CONFIG_SCHEMA,
  "grpc-2-mcp": GRPC_2_MCP_CONFIG_SCHEMA,
  "arazzo-2-mcp": ARAZZO_2_MCP_CONFIG_SCHEMA,
};

export function getImporterConfigSchema(engine: string): ImporterConfigJsonSchema | undefined {
  return IMPORTER_CONFIG_SCHEMAS[engine];
}

export function validateMcpManifestImporterConfig(manifest: unknown): McpManifest {
  const parsed = McpManifestSchema.parse(manifest);
  const schema = getImporterConfigSchema(parsed.spec.importer.engine);
  if (!schema || !parsed.spec.config) return parsed;

  if (parsed.spec.config.schema) {
    validateManifestConfigSchema(parsed.spec.importer.engine, schema, parsed.spec.config.schema);
  }
  validateImporterConfigValues(parsed.spec.importer.engine, schema, parsed.spec.config.defaults);
  return parsed;
}

function validateManifestConfigSchema(
  engine: string,
  importerSchema: ImporterConfigJsonSchema,
  manifestSchema: JsonSchemaLike,
): void {
  const properties = isRecord(manifestSchema.properties) ? manifestSchema.properties : {};
  for (const property of Object.keys(properties)) {
    if (!hasOwn(importerSchema.properties, property)) {
      throw new Error(`${engine} config field "${property}" is not supported by importer schema.`);
    }
  }

  const required = Array.isArray(manifestSchema.required) ? manifestSchema.required : [];
  for (const property of required) {
    if (!hasOwn(importerSchema.properties, property)) {
      throw new Error(`${engine} config field "${property}" is not supported by importer schema.`);
    }
  }
}

function validateImporterConfigValues(
  engine: string,
  schema: ImporterConfigJsonSchema,
  values: Record<string, unknown>,
): void {
  for (const [property, value] of Object.entries(values)) {
    const propertySchema = schema.properties[property];
    if (!propertySchema) {
      throw new Error(`${engine} config field "${property}" is not supported by importer schema.`);
    }
    validateImporterConfigValue(engine, property, propertySchema, value);
  }
}

function validateImporterConfigValue(
  engine: string,
  property: string,
  schema: JsonSchemaLike,
  value: unknown,
): void {
  const expectedType = schema.type;
  if (typeof expectedType === "string" && !matchesJsonType(value, expectedType)) {
    throw new Error(`${engine} config field "${property}": expected ${expectedType}.`);
  }
  if (schema.format === "uri" && typeof value === "string") {
    try {
      new URL(value);
    } catch {
      throw new Error(`${engine} config field "${property}": expected uri.`);
    }
  }
  if (typeof schema.minimum === "number" && typeof value === "number" && value < schema.minimum) {
    throw new Error(`${engine} config field "${property}": expected >= ${schema.minimum}.`);
  }
}

function matchesJsonType(value: unknown, type: string): boolean {
  switch (type) {
    case "array":
      return Array.isArray(value);
    case "boolean":
      return typeof value === "boolean";
    case "integer":
      return Number.isInteger(value);
    case "number":
      return typeof value === "number";
    case "object":
      return isRecord(value);
    case "string":
      return typeof value === "string";
    default:
      return true;
  }
}

const ExposeItemSchema = z
  .object({
    from: z.string().min(1),
    name: z.string().min(1).optional(),
    deny: z.boolean().default(false),
    reason: z.string().min(1).optional(),
  })
  .strict();

export const McpManifestExposeSchema = z
  .object({
    tools: z.array(ExposeItemSchema).default([]),
    resources: z.array(ExposeItemSchema).default([]),
    prompts: z.array(ExposeItemSchema).default([]),
  })
  .strict();
export type McpManifestExpose = z.infer<typeof McpManifestExposeSchema>;

export const McpManifestDeploymentSchema = z
  .object({
    transport: z.enum(["stdio", "streamable-http", "sse"]),
    auth: McpManifestDeploymentAuthSchema.optional(),
    userConfig: z.record(z.string(), JsonSchemaLikeSchema).default({}),
    configSchema: JsonSchemaLikeSchema.optional(),
    refresh: z
      .object({
        webhookPath: z.string().min(1).optional(),
        triggers: z.array(z.string().min(1)).default([]),
      })
      .strict()
      .optional(),
  })
  .strict();
export type McpManifestDeployment = z.infer<typeof McpManifestDeploymentSchema>;

export const McpManifestServerRemoteSchema = z
  .object({
    type: z.enum(["streamable-http", "sse", "stdio"]).or(z.string().min(1)),
    url: z.string().url(),
    headers: z.array(z.record(z.string(), z.unknown())).optional(),
    variables: z.record(z.string(), z.unknown()).optional(),
  })
  .catchall(z.unknown());
export type McpManifestServerRemote = z.infer<typeof McpManifestServerRemoteSchema>;

export const McpManifestServerSchema = z
  .object({
    packages: z.array(ServerJsonPackageSchema).default([]),
    remotes: z.array(McpManifestServerRemoteSchema).default([]),
  })
  .strict()
  .refine(
    (server) => server.packages.length > 0 || server.remotes.length > 0,
    "server must include at least one package or remote declaration",
  );
export type McpManifestServer = z.infer<typeof McpManifestServerSchema>;

export const McpManifestSpecSchema = z
  .object({
    importer: McpManifestImporterSchema,
    source: McpManifestSourceSchema,
    select: McpManifestSelectSchema,
    auth: z.array(McpManifestAuthSchema).default([]),
    config: McpManifestConfigSchema.optional(),
    expose: McpManifestExposeSchema.default({
      tools: [],
      resources: [],
      prompts: [],
    }),
  })
  .strict()
  .superRefine((spec, context) => {
    if (spec.importer.engine !== "git-2-mcp-spike") return;
    if (spec.source.type !== "git") {
      context.addIssue({
        code: "custom",
        message: "git-2-mcp manifests require source.type=git",
        path: ["source", "type"],
      });
      return;
    }
    if (spec.select.pythonFunctions.length === 0) {
      context.addIssue({
        code: "custom",
        message: "git-2-mcp manifests require at least one select.pythonFunctions entry",
        path: ["select", "pythonFunctions"],
      });
    }
    const ref = spec.source.ref ?? gitRefFromUri(spec.source.uri);
    if (!ref || !isImmutableGitRef(ref)) {
      context.addIssue({
        code: "custom",
        message:
          "git-2-mcp sources must be pinned to an immutable commit SHA in source.ref or uri @ref",
        path: ["source", spec.source.ref ? "ref" : "uri"],
      });
    }
  });
export type McpManifestSpec = z.infer<typeof McpManifestSpecSchema>;

export const McpManifestSchema = z
  .object({
    apiVersion: z.literal(MCP_MANIFEST_API_VERSION),
    kind: z.literal(MCP_MANIFEST_KIND),
    metadata: McpManifestMetadataSchema,
    spec: McpManifestSpecSchema,
    deployment: McpManifestDeploymentSchema,
    server: McpManifestServerSchema.optional(),
    _meta: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export type McpManifest = z.infer<typeof McpManifestSchema>;

export const OfficialMcpServerJsonDraftSchema = z
  .object({
    $schema: z.string().optional(),
    name: z.string().regex(/^[a-zA-Z0-9.-]+\/[a-zA-Z0-9._-]+$/),
    description: z.string().min(1).optional(),
    version: z.string().min(1).optional(),
    _meta: z.record(z.string(), z.unknown()).optional(),
  })
  .catchall(z.unknown());
export type OfficialMcpServerJsonDraft = z.infer<typeof OfficialMcpServerJsonDraftSchema>;

export function attachMcpManifestToServerJson(
  serverJson: unknown,
  manifest: unknown,
): OfficialMcpServerJsonDraft {
  const parsedServer = OfficialMcpServerJsonDraftSchema.parse(serverJson);
  const parsedManifest = McpManifestSchema.parse(manifest);
  const remoteHeaders = mcpManifestDeploymentAuthHeaders(parsedManifest);
  const serverWithHeaders =
    remoteHeaders.length === 0 ? parsedServer : attachRemoteHeaders(parsedServer, remoteHeaders);

  return {
    ...serverWithHeaders,
    _meta: {
      ...serverWithHeaders._meta,
      [QUICKDEPLOY_MCP_MANIFEST_META_KEY]: parsedManifest,
    },
  };
}

export type McpManifestRemoteHeader = {
  name: string;
  description: string;
  required: boolean;
  value?: string;
};

export function mcpManifestDeploymentAuthHeaders(
  manifest: McpManifest | unknown,
): McpManifestRemoteHeader[] {
  const parsed = McpManifestSchema.parse(manifest);
  const auth = parsed.deployment.auth;
  if (!auth || auth.type === "none") return [];

  switch (auth.type) {
    case "gateway":
      return [
        {
          name: auth.authenticatedHeader.name,
          description: "Gateway assertion header added by the QuickDeploy ingress.",
          required: true,
          ...(auth.authenticatedHeader.value ? { value: auth.authenticatedHeader.value } : {}),
        },
      ];
    case "bearer":
      return [
        {
          name: "Authorization",
          description: auth.tokenFrom
            ? `Bearer token sourced from ${auth.tokenFrom.env}.`
            : "Bearer token supplied by the MCP client.",
          required: true,
          ...(auth.tokenFrom ? { value: `Bearer \${${auth.tokenFrom.env}}` } : {}),
        },
      ];
    case "oauth2-resource":
      return [
        {
          name: "Authorization",
          description: `OAuth 2.1 access token for ${auth.resourceMetadataUrl}.`,
          required: true,
          value: "Bearer ${MCP_ACCESS_TOKEN}",
        },
      ];
  }
}

function attachRemoteHeaders(
  serverJson: OfficialMcpServerJsonDraft,
  headers: McpManifestRemoteHeader[],
): OfficialMcpServerJsonDraft {
  if (!isRecord(serverJson) || !Array.isArray(serverJson.remotes)) return serverJson;

  return {
    ...serverJson,
    remotes: serverJson.remotes.map((remote) => {
      if (!isRecord(remote)) return remote;
      const existingHeaders = Array.isArray(remote.headers) ? remote.headers : [];
      const existingNames = new Set(
        existingHeaders
          .filter(isRecord)
          .map((header) => header.name)
          .filter((name): name is string => typeof name === "string")
          .map((name) => name.toLowerCase()),
      );
      const missing = headers.filter((header) => !existingNames.has(header.name.toLowerCase()));
      return missing.length === 0
        ? remote
        : {
            ...remote,
            headers: [...existingHeaders, ...missing],
          };
    }),
  };
}

export type OpenApiOperationSelection = {
  method: string;
  path: string;
  operation: Record<string, unknown>;
};

const OPENAPI_METHODS = new Set([
  "DELETE",
  "GET",
  "HEAD",
  "OPTIONS",
  "PATCH",
  "POST",
  "PUT",
  "TRACE",
]);

export function apiManifestToMcpManifestSelect(apiManifest: unknown): McpManifestSelect {
  const parsed = ApiManifestSchema.parse(apiManifest);
  const requests = uniqueRequests(
    Object.values(parsed.apiDependencies).flatMap((dependency) =>
      dependency.requests.map((request) => ({
        method: request.method,
        uriTemplate: request.uriTemplate,
      })),
    ),
  );

  return McpManifestSelectSchema.parse({ requests });
}

export function apiManifestDependencyAuthToMcpAuth(
  dependencyName: string,
  dependency: unknown,
  envName = `${toEnvPrefix(dependencyName)}_OAUTH_TOKEN`,
): McpManifestAuth[] {
  const parsed = ApiManifestDependencySchema.parse(dependency);
  if (!parsed.authorizationRequirements) return [];

  return McpManifestAuthSchema.array().parse([
    {
      type: "oauth2",
      valueFrom: {
        env: envName,
      },
    },
  ]);
}

export function selectOpenApiOperations(
  openApiDocument: unknown,
  select: unknown,
): OpenApiOperationSelection[] {
  const parsedSelect = McpManifestSelectSchema.parse(select);
  const paths = readOpenApiPaths(openApiDocument);
  const selections: OpenApiOperationSelection[] = [];

  for (const [path, pathItem] of Object.entries(paths)) {
    if (!isRecord(pathItem)) continue;

    for (const [methodName, operation] of Object.entries(pathItem)) {
      const method = methodName.toUpperCase();
      if (!OPENAPI_METHODS.has(method) || !isRecord(operation)) continue;

      const selected = parsedSelect.requests.some(
        (request) => request.method === method && uriTemplatesMatch(request.uriTemplate, path),
      );
      if (selected) selections.push({ method, path, operation });
    }
  }

  return selections;
}

export function uriTemplatesMatch(left: string, right: string): boolean {
  const leftSegments = pathSegments(left);
  const rightSegments = pathSegments(right);
  if (leftSegments.length !== rightSegments.length) return false;

  return leftSegments.every((segment, index) => {
    const other = rightSegments[index];
    return (isTemplateParameter(segment) && isTemplateParameter(other)) || segment === other;
  });
}

function uniqueRequests(requests: McpManifestRequestSelect[]): McpManifestRequestSelect[] {
  const seen = new Set<string>();
  const unique: McpManifestRequestSelect[] = [];

  for (const request of requests) {
    const key = `${request.method}\0${normalizeUriPath(request.uriTemplate)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(request);
  }

  return unique;
}

function readOpenApiPaths(openApiDocument: unknown): Record<string, unknown> {
  if (!isRecord(openApiDocument) || !isRecord(openApiDocument.paths)) {
    throw new Error("OpenAPI document must include a paths object");
  }
  return openApiDocument.paths;
}

function pathSegments(uriTemplate: string): string[] {
  return normalizeUriPath(uriTemplate)
    .split("/")
    .filter((segment) => segment.length > 0);
}

function normalizeUriPath(uriTemplate: string): string {
  const path = parseUriPath(uriTemplate).replace(/\/+$/, "");
  return path.length === 0 ? "/" : path;
}

function parseUriPath(uriTemplate: string): string {
  try {
    const parsed = new URL(uriTemplate);
    return decodeURIComponent(parsed.pathname);
  } catch {
    const withoutQuery = uriTemplate.split(/[?#]/, 1)[0] ?? "";
    const path = withoutQuery.startsWith("/") ? withoutQuery : `/${withoutQuery}`;
    return decodeURIComponent(path);
  }
}

function isTemplateParameter(segment: string): boolean {
  return /^\{[^{}]+\}$/.test(segment);
}

function toEnvPrefix(value: string): string {
  const prefix = value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
  return prefix.length > 0 ? prefix : "API_MANIFEST";
}

function gitRefFromUri(uri: string): string | undefined {
  const marker = uri.lastIndexOf("@");
  if (marker === -1 || marker === uri.length - 1) return undefined;
  return uri.slice(marker + 1);
}

function isImmutableGitRef(ref: string): boolean {
  return /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/i.test(ref);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}
