import { Parser } from "@asyncapi/parser";
import { buildPublishTools, type PublishBinding, type PublishOperationSpec } from "./binding";
import {
  AsyncApiImportError,
  getObject,
  isJsonObject,
  resolvePointer,
  stringValue,
} from "./document-utils";
import type {
  AsyncApiDocument,
  JsonObject,
  JsonValue,
  KafkaProducer,
  PublishTool,
  PublishToolInput,
} from "./types";

export { AsyncApiImportError } from "./document-utils";
export { normalizeToolName } from "./binding";

interface BuildPublishToolsOptions {
  producer: KafkaProducer;
}

export async function loadAsyncApiDocument(
  source: string | AsyncApiDocument,
): Promise<AsyncApiDocument> {
  if (typeof source !== "string") {
    return source;
  }

  const parser = new Parser();
  const { document, diagnostics } = await parser.parse(source);
  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === 0);
  if (!document || errors.length > 0) {
    throw new AsyncApiImportError(
      `Invalid AsyncAPI document: ${errors.map((error) => error.message).join("; ") || "parser returned no document"}`,
    );
  }

  const raw = document.json();
  if (!isJsonObject(raw)) {
    throw new AsyncApiImportError("AsyncAPI parser returned a non-object document.");
  }
  return raw as unknown as AsyncApiDocument;
}

export async function buildKafkaPublishTools(
  source: string | AsyncApiDocument,
  options: BuildPublishToolsOptions,
): Promise<PublishTool[]> {
  const document = await loadAsyncApiDocument(source);
  return buildPublishTools(document, options.producer, kafkaPublishBinding);
}

const kafkaPublishBinding: PublishBinding<string, KafkaProducer> = {
  broker: "kafka",
  extraInputSchema: () => ({
    key: {
      type: "string",
      description:
        "Optional Kafka message key. Defaults to partitionKey, x-kafka-key, petId, or id.",
    },
    partitionKey: {
      type: "string",
      description: "Optional producer-agnostic partition key alias used as the Kafka message key.",
    },
    headers: {
      type: "object",
      additionalProperties: { type: "string" },
      description: "Optional Kafka message headers.",
    },
  }),
  resolveTarget: (spec) => kafkaTopic(spec.channel, spec.channelName),
  send: async ({ producer, target, spec, payload, input }) => {
    const key = kafkaKey(spec, input, payload);
    const acks = await producer.send({
      topic: target,
      messages: [
        {
          key,
          value: JSON.stringify(payload),
          headers: input.headers,
        },
      ],
    });

    const ack = acks[0] ?? {};
    const topic = ack.topicName ?? target;
    const offset = ack.baseOffset;
    const partition = ack.partition;
    const messageId =
      partition !== undefined && offset ? `${topic}/${partition}/${offset}` : undefined;

    return {
      content: [
        {
          type: "text",
          text: `Published ${spec.messageName} to ${topic}.`,
        },
      ],
      structuredContent: {
        accepted: true,
        messageName: spec.messageName,
        broker: "kafka",
        topic,
      },
      _meta: {
        partition,
        offset,
        messageId,
      },
    };
  },
};

function kafkaTopic(channel: JsonObject, channelName: string): string {
  const kafka = getObject(getObject(channel.bindings)?.kafka);
  return stringValue(kafka?.topic) ?? stringValue(channel.address) ?? channelName;
}

function kafkaKey(
  spec: PublishOperationSpec,
  input: PublishToolInput,
  payload: JsonObject,
): string | undefined {
  return (
    stringValue(input.key) ??
    stringValue(input.partitionKey) ??
    keyFromExtension(spec.operation["x-kafka-key"], payload) ??
    keyFromExtension(spec.message["x-kafka-key"], payload) ??
    stringValue(payload.petId) ??
    stringValue(payload.id)
  );
}

function keyFromExtension(
  extension: JsonValue | undefined,
  payload: JsonObject,
): string | undefined {
  const path = stringValue(extension);
  if (!path) return undefined;
  if (path.startsWith("/")) return stringValue(resolvePointer(payload, path));
  return stringValue(payload[path]);
}
