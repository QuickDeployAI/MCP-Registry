export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export function jsonText(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

export function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: jsonText(data) }] };
}

export function toolError(error: string, details?: Record<string, JsonValue>) {
  return ok({
    error,
    ...(details ?? {}),
  });
}
