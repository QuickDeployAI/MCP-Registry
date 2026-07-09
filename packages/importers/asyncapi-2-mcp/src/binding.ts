import Ajv, { type ErrorObject, type ValidateFunction } from "ajv";
import {
  AsyncApiImportError,
  firstOperationMessage,
  getObject,
  isJsonObject,
  messageNameFor,
  resolveOperationChannel,
  stringValue,
} from "./document-utils";
import type {
  AsyncApiDocument,
  JsonObject,
  JsonSchema,
  PublishTool,
  PublishToolInput,
  PublishToolResult,
} from "./types";

const ajv = new Ajv({ allErrors: true, strict: false });

export interface PublishOperationSpec {
  operationId: string;
  operation: JsonObject;
  channelName: string;
  channel: JsonObject;
  messageName: string;
  message: JsonObject;
  payloadSchema: JsonSchema;
}

/**
 * A publish binding supplies everything that differs between wire protocols
 * (target resolution, extra tool-input fields, and the actual send call) so
 * that operation discovery, payload validation, and tool naming stay shared
 * across every broker.
 */
export interface PublishBinding<TTarget, TProducer> {
  readonly broker: string;
  /** JSON Schema properties layered onto the generated tool input (e.g. Kafka key, MQTT channel params). */
  extraInputSchema(spec: PublishOperationSpec): JsonObject;
  /** Resolve the per-call wire target (topic/subject) from the channel and the caller-supplied input. */
  resolveTarget(spec: PublishOperationSpec, input: PublishToolInput): TTarget;
  send(args: {
    producer: TProducer;
    target: TTarget;
    spec: PublishOperationSpec;
    payload: JsonObject;
    input: PublishToolInput;
  }): Promise<PublishToolResult>;
}

export function collectPublishOperations(document: AsyncApiDocument): PublishOperationSpec[] {
  const operations = document.operations ?? {};
  return Object.entries(operations).flatMap(([operationId, operation]) => {
    if (!isJsonObject(operation) || operation.action !== "send") return [];

    const { channelName, channel } = resolveOperationChannel(document, operation);
    if (!isJsonObject(channel)) {
      throw new AsyncApiImportError(
        `Operation ${operationId} references missing channel ${channelName}.`,
      );
    }

    const message = firstOperationMessage(document, operation, channel, operationId);
    const payloadSchema = getObject(message.payload) ?? {};

    return [
      {
        operationId,
        operation,
        channelName,
        channel,
        messageName: messageNameFor(message, normalizeToolName(operationId), /^publish_/),
        message,
        payloadSchema,
      },
    ];
  });
}

export function buildPublishTools<TTarget, TProducer>(
  document: AsyncApiDocument,
  producer: TProducer,
  binding: PublishBinding<TTarget, TProducer>,
): PublishTool[] {
  return collectPublishOperations(document).map((spec) =>
    createPublishTool(spec, producer, binding),
  );
}

function createPublishTool<TTarget, TProducer>(
  spec: PublishOperationSpec,
  producer: TProducer,
  binding: PublishBinding<TTarget, TProducer>,
): PublishTool {
  const validate = ajv.compile(spec.payloadSchema);
  const defaultToolName = normalizeToolName(spec.operationId).startsWith("publish_")
    ? spec.operationId
    : `publish_${spec.operationId}`;
  const toolName = normalizeToolName(
    stringValue(getObject(spec.operation["x-quickdeploy-mcp"])?.toolName) ?? defaultToolName,
  );
  const extraSchema = binding.extraInputSchema(spec);
  const extraKeys = new Set(Object.keys(extraSchema));

  return {
    operationId: spec.operationId,
    name: toolName,
    description:
      stringValue(spec.operation.summary) ??
      stringValue(spec.operation.description) ??
      `Publish ${spec.messageName} via ${binding.broker}.`,
    inputSchema: publishInputSchema(spec.payloadSchema, extraSchema),
    publish: async (input) => {
      const payload = omitKeys(input, extraKeys);
      if (!validate(payload)) {
        throw new AsyncApiImportError(
          `Invalid ${spec.messageName} payload: ${formatAjvErrors(validate.errors)}`,
        );
      }

      const target = binding.resolveTarget(spec, input);
      return binding.send({ producer, target, spec, payload, input });
    },
  };
}

export function normalizeToolName(value: string): string {
  const normalized = value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();

  return normalized || "publish_message";
}

function publishInputSchema(payloadSchema: JsonSchema, extraProperties: JsonObject): JsonSchema {
  const baseProperties = getObject(payloadSchema.properties) ?? {};
  return {
    ...payloadSchema,
    type: "object",
    properties: {
      ...baseProperties,
      ...extraProperties,
    },
  };
}

function omitKeys(input: PublishToolInput, keys: Set<string>): JsonObject {
  return Object.fromEntries(Object.entries(input).filter(([key]) => !keys.has(key)));
}

function formatAjvErrors(errors: ErrorObject[] | null | undefined): string {
  return (errors ?? [])
    .map((error) => {
      const path = error.instancePath || "payload";
      return `${path} ${error.message ?? "is invalid"}`.trim();
    })
    .join("; ");
}
