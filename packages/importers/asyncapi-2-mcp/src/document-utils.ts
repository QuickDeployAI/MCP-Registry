import type { AsyncApiDocument, JsonObject, JsonValue } from "./types";

export class AsyncApiImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AsyncApiImportError";
  }
}

export function resolveOperationChannel(
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
    const match = Object.entries(document.channels ?? {}).find(([, candidate]) => {
      if (!isJsonObject(candidate)) return false;
      return (
        stringValue(candidate.address) === stringValue(channelRef.address) ||
        JSON.stringify(candidate.messages ?? {}) === JSON.stringify(channelRef.messages ?? {})
      );
    });

    if (match) return { channelName: match[0], channel: match[1] };
    return {
      channelName: stringValue(channelRef.address) ?? "dereferenced-channel",
      channel: channelRef,
    };
  }

  throw new AsyncApiImportError("Operation is missing a channel reference.");
}

export function firstOperationMessage(
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

  throw new AsyncApiImportError(`Operation ${operationId} has no resolvable message.`);
}

export function messageNameFor(
  message: JsonObject,
  normalizedOperationName: string,
  prefixToStrip: RegExp,
): string {
  return (
    stringValue(message.name) ??
    stringValue(message["x-parser-message-name"]) ??
    normalizedOperationName.replace(prefixToStrip, "").replaceAll("_", ".")
  );
}

export function resolveMaybeRef(
  document: AsyncApiDocument,
  value: JsonValue | undefined,
): JsonValue | undefined {
  if (isJsonObject(value) && typeof value.$ref === "string") {
    return resolvePointer(document, value.$ref);
  }
  return value;
}

export function resolvePointer(root: JsonValue, pointer: string): JsonValue | undefined {
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

export function refName(ref: JsonValue | undefined): string | undefined {
  const value = stringValue(ref);
  if (!value) return undefined;
  const parts = value.split("/");
  return unescapePointerSegment(parts.at(-1) ?? "");
}

export function getObject(value: JsonValue | undefined): JsonObject | undefined {
  return isJsonObject(value) ? value : undefined;
}

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function stringValue(value: JsonValue | undefined): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function numberValue(value: JsonValue | undefined): number | undefined {
  return typeof value === "number" ? value : undefined;
}

export function escapePointerSegment(segment: string): string {
  return segment.replaceAll("~", "~0").replaceAll("/", "~1");
}

export function unescapePointerSegment(segment: string): string {
  return segment.replaceAll("~1", "/").replaceAll("~0", "~");
}
