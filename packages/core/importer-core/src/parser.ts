export type ParserDiagnostic = {
  level: "info" | "warn" | "error";
  message: string;
};

export type ArtifactSourceEntry = {
  identifier: string;
  displayName: string;
  type: string;
  description?: string | undefined;
  url?: string | undefined;
  data?: unknown;
  metadata?: Record<string, unknown> | undefined;
};

export type ParsedCapability<Kind extends string = string> = {
  kind: Kind;
  name: string;
  description?: string;
  inputSchema?: unknown;
  raw: unknown;
};

export type McpProjection = {
  tools?: readonly unknown[];
  resources?: readonly unknown[];
  prompts?: readonly unknown[];
};

export type ArtifactParseResult<Kind extends string = string> = {
  capabilities: ParsedCapability<Kind>[];
  mcpProjection?: McpProjection;
  diagnostics: ParserDiagnostic[];
};

export type ArtifactParser<
  Entry extends ArtifactSourceEntry = ArtifactSourceEntry,
  Kind extends string = string,
> = {
  readonly mediaTypes: readonly string[];
  parse(nativeArtifact: unknown, entry: Entry): Promise<ArtifactParseResult<Kind>>;
};
