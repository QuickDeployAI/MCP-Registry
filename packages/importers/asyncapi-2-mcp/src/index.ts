import { collectPublishOperations, normalizeToolName } from "./binding";
import { getObject, isJsonObject, resolveMaybeRef, stringValue } from "./document-utils";
import { buildKafkaPublishTools, loadAsyncApiDocument } from "./publish";
import type { AsyncApiDocument, JsonObject, KafkaProducer, PublishTool } from "./types";

export const ASYNCAPI_MEDIA_TYPE = "application/vnd.asyncapi+json";

export type AsyncApiInlineInput = AsyncApiDocument | Record<string, unknown> | string | Uint8Array;

export type AsyncApiArdEntry = {
  identifier: string;
  displayName: string;
  type: string;
  url?: string;
  data?: unknown;
  metadata?: Record<string, unknown>;
};

export type AsyncApiCapabilityKind = "api-contract" | "event" | "tool";

export type ParsedCapability = {
  kind: AsyncApiCapabilityKind;
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  raw: unknown;
};

export type ArtifactParseDiagnostic = {
  level: "info" | "warn" | "error";
  message: string;
};

export type ArtifactParseResult = {
  capabilities: ParsedCapability[];
  mcpProjection?: AsyncApiMcpProjection;
  diagnostics: ArtifactParseDiagnostic[];
};

export type ArtifactParser = {
  readonly mediaTypes: readonly string[];
  parse(nativeArtifact: AsyncApiInlineInput, entry: AsyncApiArdEntry): Promise<ArtifactParseResult>;
};

export type AsyncApiMcpProjection = {
  tools: PublishTool[];
};

export type BuildAsyncApiToolsOptions = {
  producer: KafkaProducer;
};

export async function parseAsyncApiDocument(input: AsyncApiInlineInput): Promise<AsyncApiDocument> {
  return loadAsyncApiDocument(decodeInlineInput(input));
}

export function asyncApiToParsedCapabilities(document: AsyncApiDocument): ParsedCapability[] {
  return [
    {
      kind: "api-contract",
      name: stringValue(getObject(document.info)?.title) ?? "AsyncAPI document",
      description: stringValue(getObject(document.info)?.description),
      raw: document,
    },
    ...collectEventCapabilities(document),
    ...collectPublishOperations(document).map((operation) => ({
      kind: "tool" as const,
      name: normalizeToolName(operation.operationId),
      description:
        stringValue(operation.operation.summary) ??
        stringValue(operation.operation.description) ??
        `Publish ${operation.messageName}.`,
      inputSchema: publishCapabilityInputSchema(operation.payloadSchema),
      raw: operation.operation,
    })),
  ];
}

export async function buildAsyncApiTools(
  input: AsyncApiInlineInput,
  options: BuildAsyncApiToolsOptions,
): Promise<PublishTool[]> {
  return buildKafkaPublishTools(decodeInlineInput(input), options);
}

export function createAsyncApiArtifactParser(runtime?: BuildAsyncApiToolsOptions): ArtifactParser {
  return {
    mediaTypes: [ASYNCAPI_MEDIA_TYPE],
    async parse(nativeArtifact) {
      const document = await parseAsyncApiDocument(nativeArtifact);
      const diagnostics: ArtifactParseDiagnostic[] = [];
      const mcpProjection = runtime
        ? { tools: await buildAsyncApiTools(document, runtime) }
        : undefined;

      if (!runtime) {
        diagnostics.push({
          level: "info",
          message: "AsyncAPI document parsed without broker runtime; MCP projection omitted.",
        });
      }

      return {
        capabilities: asyncApiToParsedCapabilities(document),
        ...(mcpProjection ? { mcpProjection } : {}),
        diagnostics,
      };
    },
  };
}

export const asyncApiArtifactParser = createAsyncApiArtifactParser();

export {
  AsyncApiImportError,
  buildKafkaPublishTools,
  loadAsyncApiDocument,
  normalizeToolName,
} from "./publish";
export { buildMqttPublishTools } from "./publish-mqtt";
export { buildKafkaConsumeBindings } from "./consume";
export type { PublishBinding, PublishOperationSpec } from "./binding";
export type {
  AsyncApiDocument,
  ConsumeBinding,
  ConsumeNotification,
  ConsumeResource,
  ConsumedMessageEnvelope,
  ConsumeTool,
  ConsumeToolInput,
  ConsumeToolResult,
  JsonObject,
  JsonSchema,
  KafkaConsumedMessage,
  KafkaConsumer,
  KafkaMessageHandler,
  KafkaPublishAck,
  KafkaProducer,
  KafkaSubscription,
  MqttProducer,
  MqttPublishAck,
  MqttPublishRequest,
  MqttQos,
  PublishTool,
  PublishToolInput,
  PublishToolResult,
} from "./types";

function collectEventCapabilities(document: AsyncApiDocument): ParsedCapability[] {
  const events = new Map<string, ParsedCapability>();

  for (const [channelName, channel] of Object.entries(document.channels ?? {})) {
    if (!isJsonObject(channel)) continue;

    const messages = getObject(channel.messages);
    for (const [messageKey, messageRef] of Object.entries(messages ?? {})) {
      const message = resolveMaybeRef(document, messageRef);
      if (!isJsonObject(message)) continue;

      const name =
        stringValue(message.name) ??
        `${normalizeToolName(channelName)}.${normalizeToolName(messageKey)}`;
      const key = `${channelName}\0${name}`;
      if (events.has(key)) continue;

      events.set(key, {
        kind: "event",
        name,
        description:
          stringValue(message.summary) ??
          stringValue(message.description) ??
          `AsyncAPI event ${name}.`,
        raw: {
          channelName,
          channel,
          message,
        },
      });
    }
  }

  return [...events.values()];
}

function publishCapabilityInputSchema(payloadSchema: JsonObject): Record<string, unknown> {
  return {
    ...payloadSchema,
    type: "object",
    properties: {
      ...(getObject(payloadSchema.properties) ?? {}),
      key: {
        type: "string",
        description:
          "Optional Kafka message key. Defaults to partitionKey, x-kafka-key, petId, or id.",
      },
      partitionKey: {
        type: "string",
        description:
          "Optional producer-agnostic partition key alias used as the Kafka message key.",
      },
      headers: {
        type: "object",
        additionalProperties: { type: "string" },
        description: "Optional Kafka message headers.",
      },
    },
  };
}

function decodeInlineInput(input: AsyncApiInlineInput): string | AsyncApiDocument {
  if (input instanceof Uint8Array) return Buffer.from(input).toString("utf8");
  return input as string | AsyncApiDocument;
}
