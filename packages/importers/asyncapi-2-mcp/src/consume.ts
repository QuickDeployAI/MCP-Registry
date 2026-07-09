import { AsyncApiImportError, loadAsyncApiDocument, normalizeToolName } from "./publish";
import type {
  AsyncApiDocument,
  ConsumeBinding,
  ConsumeNotification,
  ConsumeResource,
  ConsumeTool,
  ConsumeToolInput,
  ConsumeToolResult,
  ConsumedMessageEnvelope,
  JsonObject,
  JsonValue,
  KafkaConsumedMessage,
  KafkaConsumer,
  KafkaSubscription,
} from "./types";

interface BuildConsumeBindingsOptions {
  consumer: KafkaConsumer;
  bufferSize?: number;
  fromBeginning?: boolean;
  notificationSink?: (notification: ConsumeNotification) => void | Promise<void>;
  now?: () => Date;
}

interface ReceiveOperationSpec {
  operationId: string;
  operation: JsonObject;
  channelName: string;
  channel: JsonObject;
  messageName: string;
  topic: string;
}

const defaultBufferSize = 100;

export async function buildKafkaConsumeBindings(
  source: string | AsyncApiDocument,
  options: BuildConsumeBindingsOptions,
): Promise<ConsumeBinding[]> {
  const document = await loadAsyncApiDocument(source);
  return collectReceiveOperations(document).map((spec) => createConsumeBinding(spec, options));
}

function createConsumeBinding(
  spec: ReceiveOperationSpec,
  options: BuildConsumeBindingsOptions,
): ConsumeBinding {
  const operationName = normalizeToolName(spec.operationId);
  const resource: ConsumeResource = {
    uri: `asyncapi://consume/${operationName}/${encodeURIComponent(spec.topic)}`,
    name: operationName,
    mimeType: "application/json",
    description: `Buffered ${spec.messageName} messages from ${spec.topic}.`,
  };
  const buffer = new BoundedMessageBuffer(options.bufferSize ?? defaultBufferSize);
  const subscribers = new Set<string>();
  let subscription: KafkaSubscription | undefined;

  const getNextMessages = async (input: ConsumeToolInput = {}) =>
    messageResult(spec.topic, buffer.readAfter(stringValue(input.cursor), numberValue(input.max)));
  const peekLatest = async (input: ConsumeToolInput = {}) =>
    messageResult(spec.topic, buffer.peekLatest(numberValue(input.max)));

  const tools: ConsumeTool[] = [
    {
      name: "get_next_messages",
      description:
        "Return buffered messages after an optional cursor. Replay is bounded by the local buffer.",
      inputSchema: cursorInputSchema(),
      call: getNextMessages,
    },
    {
      name: "peek_latest",
      description: "Return the newest buffered messages without advancing a cursor.",
      inputSchema: latestInputSchema(),
      call: peekLatest,
    },
  ];

  return {
    operationId: spec.operationId,
    topic: spec.topic,
    resource,
    tools,
    start: async () => {
      if (subscription) return;
      subscription = await options.consumer.subscribe({
        topic: spec.topic,
        fromBeginning: options.fromBeginning,
        onMessage: async (message) => {
          const envelope = toEnvelope(message, options.now ?? (() => new Date()));
          buffer.push(envelope);
          if (subscribers.size > 0) {
            await options.notificationSink?.({
              resourceUri: resource.uri,
              cursor: envelope.cursor,
            });
          }
        },
      });
    },
    stop: async () => {
      await subscription?.close();
      subscription = undefined;
    },
    subscribeResource: (subscriptionId) => {
      subscribers.add(subscriptionId);
    },
    unsubscribeResource: (subscriptionId) => {
      subscribers.delete(subscriptionId);
    },
    getNextMessages,
    peekLatest,
  };
}

class BoundedMessageBuffer {
  private readonly messages: ConsumedMessageEnvelope[] = [];
  private evictedBeforeCursor: string | undefined;

  constructor(private readonly limit: number) {
    if (!Number.isInteger(limit) || limit <= 0) {
      throw new AsyncApiImportError("Consume bufferSize must be a positive integer.");
    }
  }

  push(message: ConsumedMessageEnvelope): void {
    this.messages.push(message);
    while (this.messages.length > this.limit) {
      this.messages.shift();
      this.evictedBeforeCursor = this.messages[0]?.cursor;
    }
  }

  readAfter(cursor: string | undefined, max = 10): BufferRead {
    const startIndex = cursor
      ? this.messages.findIndex((message) => message.cursor === cursor) + 1
      : 0;
    const normalizedStart = startIndex > 0 ? startIndex : 0;
    const messages = this.messages.slice(normalizedStart, normalizedStart + normalizeMax(max));
    return { messages, evictedBeforeCursor: this.evictedBeforeCursor };
  }

  peekLatest(max = 1): BufferRead {
    const count = normalizeMax(max);
    return {
      messages: this.messages.slice(Math.max(0, this.messages.length - count)),
      evictedBeforeCursor: this.evictedBeforeCursor,
    };
  }
}

interface BufferRead {
  messages: ConsumedMessageEnvelope[];
  evictedBeforeCursor?: string;
}

function collectReceiveOperations(document: AsyncApiDocument): ReceiveOperationSpec[] {
  const operations = document.operations ?? {};
  return Object.entries(operations).flatMap(([operationId, operation]) => {
    if (!isJsonObject(operation) || operation.action !== "receive") return [];

    const { channelName, channel } = resolveOperationChannel(document, operation);
    if (!isJsonObject(channel)) {
      throw new AsyncApiImportError(
        `Operation ${operationId} references missing channel ${channelName}.`,
      );
    }

    const message = firstOperationMessage(document, operation, channel, operationId);
    return [
      {
        operationId,
        operation,
        channelName,
        channel,
        messageName: messageNameFor(message, operationId),
        topic: kafkaTopic(channel, channelName),
      },
    ];
  });
}

function messageResult(topic: string, read: BufferRead): ConsumeToolResult {
  const nextCursor = read.messages.at(-1)?.cursor;
  return {
    content: [
      {
        type: "text",
        text: `Read ${read.messages.length} buffered message(s) from ${topic}.`,
      },
    ],
    structuredContent: {
      topic,
      messages: read.messages,
      nextCursor,
      evictedBeforeCursor: read.evictedBeforeCursor,
    },
  };
}

function toEnvelope(message: KafkaConsumedMessage, now: () => Date): ConsumedMessageEnvelope {
  const partition = message.partition ?? 0;
  const offset = message.offset ?? String(Date.now());
  return {
    cursor: `${message.topic}/${partition}/${offset}`,
    topic: message.topic,
    partition: message.partition,
    offset: message.offset,
    key: message.key,
    headers: message.headers,
    payload: parseMessagePayload(message.value),
    receivedAt: now().toISOString(),
  };
}

function parseMessagePayload(value: string): JsonValue {
  try {
    return JSON.parse(value) as JsonValue;
  } catch {
    return value;
  }
}

function cursorInputSchema(): JsonObject {
  return {
    type: "object",
    properties: {
      cursor: {
        type: "string",
        description: "Opaque cursor returned by the previous get_next_messages call.",
      },
      max: {
        type: "integer",
        minimum: 1,
        maximum: 100,
        default: 10,
      },
    },
  };
}

function latestInputSchema(): JsonObject {
  return {
    type: "object",
    properties: {
      max: {
        type: "integer",
        minimum: 1,
        maximum: 100,
        default: 1,
      },
    },
  };
}

function resolveOperationChannel(
  document: AsyncApiDocument,
  operation: JsonObject,
): { channelName: string; channel: JsonValue | undefined } {
  const channelRef = getObject(operation.channel);
  const refChannelName =
    refName(channelRef?.$ref) ?? stringValue(channelRef?.name) ?? stringValue(operation.channel);
  if (refChannelName) {
    return {
      channelName: refChannelName,
      channel: resolvePointer(document, `#/channels/${escapePointerSegment(refChannelName)}`),
    };
  }

  if (channelRef) {
    return {
      channelName: stringValue(channelRef.address) ?? "dereferenced-channel",
      channel: channelRef,
    };
  }

  throw new AsyncApiImportError("Operation is missing a channel reference.");
}

function firstOperationMessage(
  document: AsyncApiDocument,
  operation: JsonObject,
  channel: JsonObject,
  operationId: string,
): JsonObject {
  const operationMessages = Array.isArray(operation.messages) ? operation.messages : [];
  const messageRef = operationMessages[0];
  if (messageRef !== undefined) {
    const resolved = resolveMaybeRef(document, messageRef);
    if (isJsonObject(resolved)) return resolved;
  }

  const channelMessages = getObject(channel.messages);
  const firstChannelMessage = channelMessages ? Object.values(channelMessages)[0] : undefined;
  const resolved = resolveMaybeRef(document, firstChannelMessage);
  if (isJsonObject(resolved)) return resolved;

  throw new AsyncApiImportError(`Operation ${operationId} has no resolvable receive message.`);
}

function messageNameFor(message: JsonObject, operationId: string): string {
  return (
    stringValue(message.name) ??
    stringValue(message["x-parser-message-name"]) ??
    normalizeToolName(operationId)
      .replace(/^consume_/, "")
      .replaceAll("_", ".")
  );
}

function kafkaTopic(channel: JsonObject, channelName: string): string {
  const kafka = getObject(getObject(channel.bindings)?.kafka);
  return stringValue(kafka?.topic) ?? stringValue(channel.address) ?? channelName;
}

function resolveMaybeRef(
  document: AsyncApiDocument,
  value: JsonValue | undefined,
): JsonValue | undefined {
  if (isJsonObject(value) && typeof value.$ref === "string") {
    return resolvePointer(document, value.$ref);
  }
  return value;
}

function resolvePointer(root: JsonValue, pointer: string): JsonValue | undefined {
  const normalized = pointer.startsWith("#") ? pointer.slice(1) : pointer;
  if (normalized === "" || normalized === "/") return root;
  return normalized
    .split("/")
    .filter(Boolean)
    .reduce<JsonValue | undefined>((current, segment) => {
      if (!isJsonObject(current) && !Array.isArray(current)) return undefined;
      const key = unescapePointerSegment(segment);
      return Array.isArray(current) ? current[Number(key)] : current[key];
    }, root);
}

function refName(ref: JsonValue | undefined): string | undefined {
  const value = stringValue(ref);
  if (!value) return undefined;
  const parts = value.split("/");
  return unescapePointerSegment(parts.at(-1) ?? "");
}

function getObject(value: JsonValue | undefined): JsonObject | undefined {
  return isJsonObject(value) ? value : undefined;
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: JsonValue | undefined): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberValue(value: JsonValue | undefined): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function normalizeMax(value: number): number {
  if (!Number.isFinite(value)) return 10;
  return Math.max(1, Math.min(100, Math.trunc(value)));
}

function escapePointerSegment(segment: string): string {
  return segment.replaceAll("~", "~0").replaceAll("/", "~1");
}

function unescapePointerSegment(segment: string): string {
  return segment.replaceAll("~1", "/").replaceAll("~0", "~");
}
