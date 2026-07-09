export type JsonSchema = {
  type?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  additionalProperties?: boolean;
  description?: string;
};

export type OpenApiParameter = {
  name: string;
  in: "path" | "query";
  required: boolean;
  schema: JsonSchema;
};

export type OpenApiSecurityScheme =
  | { type: "http"; scheme: "bearer" }
  | { type: "apiKey"; in: "header" | "query" | "cookie"; name: string };

export type HarOperationMeta = {
  method: string;
  path: string;
  sampleCount: number;
  capturedUrls: string[];
};

export type OpenApiOperation = {
  operationId: string;
  summary: string;
  parameters?: OpenApiParameter[];
  requestBody?: {
    required: true;
    content: Record<string, { schema: JsonSchema }>;
  };
  responses: Record<
    string,
    { description: string; content?: Record<string, { schema: JsonSchema }> }
  >;
  security?: Record<string, string[]>[];
  "x-quickdeploy-har": HarOperationMeta;
};

export type HarReviewStatus = "draft" | "reviewed";

export type HarReviewMarker = {
  status: HarReviewStatus;
  redactionFindingCount: number;
  reviewedAt?: string;
};

export type OpenApiDocument = {
  openapi: "3.1.0";
  info: { title: string; version: string };
  servers: { url: string }[];
  paths: Record<string, Record<string, OpenApiOperation>>;
  components: { securitySchemes: Record<string, OpenApiSecurityScheme> };
  "x-quickdeploy-har-review": HarReviewMarker;
};

export type HarWarning = {
  code: string;
  operation: string;
  message: string;
};

export type HarHeader = { name: string; value: string };
export type HarQueryParam = { name: string; value: string };
export type HarCookie = { name: string; value: string };
export type HarPostData = { mimeType?: string; text?: string };

export type HarRequest = {
  method: string;
  url: string;
  headers?: HarHeader[];
  queryString?: HarQueryParam[];
  cookies?: HarCookie[];
  postData?: HarPostData;
};

export type HarContent = { mimeType?: string; text?: string };

export type HarResponse = {
  status: number;
  headers?: HarHeader[];
  content?: HarContent;
};

export type HarEntry = {
  request: HarRequest;
  response?: HarResponse;
};

export type HarLog = {
  log: {
    entries: HarEntry[];
  };
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
