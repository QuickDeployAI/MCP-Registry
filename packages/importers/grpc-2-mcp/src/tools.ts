import {
  resolveCredentialBindings,
  type CredentialBinding,
  type OAuth2TokenRequest,
  type OAuth2TokenResponse,
} from "@quickdeployai/importer-core";
import type { JsonSchema } from "./schema";
import {
  parseFileDescriptorSet,
  type GrpcMethodShape,
  type UnsupportedGrpcMethod,
} from "./descriptor";
import {
  invokeServerStreaming,
  invokeUnary,
  type GrpcAuthConfig,
  type GrpcChannelSecurity,
  type ServerStreamBudget,
  type ServerStreamResult,
} from "./runtime";

export type GrpcToolRuntime = {
  protoPath: string | string[];
  packageName: string;
  address: string;
  includeDirs?: string[];
  metadata?: Record<string, string>;
  passthroughMetadata?: Record<string, string>;
  blockedPassthroughKeys?: readonly string[];
  auth?: GrpcAuthConfig;
  env?: Record<string, string | undefined>;
  channelSecurity?: GrpcChannelSecurity;
  credentialBindings?: CredentialBinding[];
  credentialEnv?: Record<string, string | undefined>;
  requestOAuth2Token?: (request: OAuth2TokenRequest) => Promise<OAuth2TokenResponse>;
};

export type McpUnaryTool = {
  name: string;
  description: string;
  serviceName: string;
  methodName: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  invoke: (request: Record<string, unknown>) => Promise<unknown>;
};

export type McpServerStreamTool = {
  name: string;
  description: string;
  serviceName: string;
  methodName: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  invoke: (
    request: Record<string, unknown>,
    options?: { onProgress?: (message: unknown, index: number) => void } & ServerStreamBudget,
  ) => Promise<ServerStreamResult>;
};

export type GrpcToolCatalog = {
  tools: McpUnaryTool[];
  streamingTools: McpServerStreamTool[];
  unsupportedMethods: UnsupportedGrpcMethod[];
};

export function buildGrpcUnaryTools(
  descriptorBytes: Uint8Array,
  options: {
    runtime: GrpcToolRuntime;
    logger?: Pick<Console, "warn">;
    streamingDefaults?: ServerStreamBudget;
  },
): GrpcToolCatalog {
  const services = parseFileDescriptorSet(descriptorBytes);
  const tools: McpUnaryTool[] = [];
  const streamingTools: McpServerStreamTool[] = [];
  const unsupportedMethods: UnsupportedGrpcMethod[] = [];

  for (const service of services) {
    for (const method of service.methods) {
      if (method.mcpExposure === "unsupported-stream") {
        const unsupported = unsupportedMethod(method);
        unsupportedMethods.push(unsupported);
        options.logger?.warn(unsupported.reason);
        continue;
      }
      if (method.mcpExposure === "server-stream-tool") {
        streamingTools.push({
          name: grpcToolName(method.fullName),
          description:
            method.description ??
            `Server-streaming gRPC method ${method.fullName} exposed through grpc-2-mcp as a bounded progress-notification tool.`,
          serviceName: shortServiceName(method.serviceName),
          methodName: method.methodName,
          inputSchema: method.inputSchema ?? {},
          outputSchema: method.outputSchema ?? {},
          invoke: (request, invokeOptions) =>
            invokeServerStreaming({
              ...options.runtime,
              serviceName: shortServiceName(method.serviceName),
              methodName: method.methodName,
              request,
              maxMessages: invokeOptions?.maxMessages ?? options.streamingDefaults?.maxMessages,
              timeoutMs: invokeOptions?.timeoutMs ?? options.streamingDefaults?.timeoutMs,
              onMessage: invokeOptions?.onProgress,
            }),
        });
        continue;
      }
      tools.push({
        name: grpcToolName(method.fullName),
        description:
          method.description ?? `Unary gRPC method ${method.fullName} exposed through grpc-2-mcp.`,
        serviceName: shortServiceName(method.serviceName),
        methodName: method.methodName,
        inputSchema: method.inputSchema ?? {},
        outputSchema: method.outputSchema ?? {},
        invoke: async (request) => {
          const resolvedCredentials = await resolveGrpcCredentials(options.runtime);
          return await invokeUnary({
            ...options.runtime,
            serviceName: shortServiceName(method.serviceName),
            methodName: method.methodName,
            request,
            metadata: {
              ...options.runtime.metadata,
              ...resolvedCredentials,
            },
          });
        },
      });
    }
  }

  return { tools, streamingTools, unsupportedMethods };
}

function unsupportedMethod(method: GrpcMethodShape): UnsupportedGrpcMethod {
  const direction =
    method.clientStreaming && method.serverStreaming
      ? "bidirectional streaming"
      : method.clientStreaming
        ? "client streaming"
        : "server streaming";
  return {
    ...method,
    mcpExposure: "unsupported-stream",
    reason: `${method.fullName} uses ${direction}; grpc-2-mcp MVP exposes unary RPCs only.`,
  };
}

function grpcToolName(fullName: string): string {
  return fullName
    .replace(/^\./, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function shortServiceName(serviceName: string): string {
  const parts = serviceName.split(".");
  return parts[parts.length - 1] ?? serviceName;
}

async function resolveGrpcCredentials(runtime: GrpcToolRuntime): Promise<Record<string, string>> {
  if (!runtime.credentialBindings || runtime.credentialBindings.length === 0) {
    return {};
  }
  const resolved = await resolveCredentialBindings(runtime.credentialBindings, {
    env: runtime.credentialEnv,
    requestOAuth2Token: runtime.requestOAuth2Token,
  });
  return resolved.headers;
}
