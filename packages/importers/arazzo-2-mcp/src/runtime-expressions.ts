import { ArazzoImportError } from "./index.js";

export class RuntimeExpressionError extends ArazzoImportError {}

export type StepResponse = {
  statusCode?: number;
  header?: Record<string, string>;
  body?: unknown;
};

export type StepResult = {
  outputs?: Record<string, unknown>;
  response?: StepResponse;
};

export type SourceDescriptionRef = {
  url?: string;
  type?: string;
  [key: string]: unknown;
};

/**
 * A practical subset of the Arazzo runtime-expression grammar, covering the forms this importer
 * needs to resolve workflow step context: `$statusCode`, `$response...`, `$inputs...`,
 * `$steps.<id>...`, and `$sourceDescriptions.<name>...`.
 */
export type RuntimeExpressionContext = {
  readonly inputs?: Readonly<Record<string, unknown>>;
  readonly steps?: Readonly<Record<string, StepResult>>;
  readonly sourceDescriptions?: Readonly<Record<string, SourceDescriptionRef>>;
  /** The "current" response in scope — e.g. the response of the step being evaluated. */
  readonly response?: StepResponse;
};

const EXPRESSION_PATTERN = /^\$([a-zA-Z]+)(.*)$/;

/** Evaluates a single Arazzo runtime expression (e.g. `$steps.createTicket.outputs.ticketId`). */
export function evaluateRuntimeExpression(
  expression: string,
  context: RuntimeExpressionContext,
): unknown {
  const trimmed = expression.trim();
  const match = EXPRESSION_PATTERN.exec(trimmed);
  if (!match) {
    throw new RuntimeExpressionError(`Not a runtime expression: "${expression}".`);
  }

  const [, keyword, rest] = match;
  const segments = splitSegments(rest ?? "");

  switch (keyword) {
    case "statusCode":
      requireNoSegments(expression, segments);
      return context.response?.statusCode;
    case "response":
      return resolveResponse(expression, context.response, segments);
    case "inputs":
      return resolveInputs(expression, context.inputs, segments);
    case "steps":
      return resolveSteps(expression, context.steps, segments);
    case "sourceDescriptions":
      return resolveSourceDescriptions(expression, context.sourceDescriptions, segments);
    default:
      throw new RuntimeExpressionError(`Unsupported runtime expression: "${expression}".`);
  }
}

/** True when the value looks like a runtime expression (starts with `$`). */
export function isRuntimeExpression(value: string): boolean {
  return EXPRESSION_PATTERN.test(value.trim());
}

function resolveResponse(
  expression: string,
  response: StepResponse | undefined,
  segments: Segment[],
): unknown {
  return resolveResponseLike(expression, response, segments);
}

function resolveResponseLike(
  expression: string,
  response: StepResponse | undefined,
  segments: Segment[],
): unknown {
  const [first, ...rest] = segments;
  if (!first) throw new RuntimeExpressionError(`"${expression}" is missing a response field.`);

  if (first.key === "statusCode") {
    requireNoSegments(expression, rest);
    return response?.statusCode;
  }
  if (first.key === "header") {
    const name = rest[0];
    if (!name || rest.length > 1) {
      throw new RuntimeExpressionError(`"${expression}" must reference a single header name.`);
    }
    return findHeader(response?.header, name.key);
  }
  if (first.key === "body") {
    requireNoSegments(expression, rest);
    return applyJsonPointer(response?.body, first.pointer);
  }

  throw new RuntimeExpressionError(`Unsupported response field in "${expression}".`);
}

function resolveInputs(
  expression: string,
  inputs: Readonly<Record<string, unknown>> | undefined,
  segments: Segment[],
): unknown {
  const [first, ...rest] = segments;
  if (!first) throw new RuntimeExpressionError(`"${expression}" is missing an input name.`);
  requireNoSegments(expression, rest);
  return applyJsonPointer(inputs?.[first.key], first.pointer);
}

function resolveSteps(
  expression: string,
  steps: Readonly<Record<string, StepResult>> | undefined,
  segments: Segment[],
): unknown {
  const [stepIdSeg, fieldSeg, ...rest] = segments;
  if (!stepIdSeg || !fieldSeg) {
    throw new RuntimeExpressionError(`"${expression}" must reference $steps.<id>.<field>.`);
  }
  const step = steps?.[stepIdSeg.key];

  if (fieldSeg.key === "outputs") {
    const name = rest[0];
    if (!name || rest.length > 1) {
      throw new RuntimeExpressionError(`"${expression}" must reference a single output name.`);
    }
    return applyJsonPointer(step?.outputs?.[name.key], name.pointer);
  }
  if (fieldSeg.key === "response") {
    return resolveResponseLike(expression, step?.response, rest);
  }

  throw new RuntimeExpressionError(`Unsupported step field in "${expression}".`);
}

function resolveSourceDescriptions(
  expression: string,
  sourceDescriptions: Readonly<Record<string, SourceDescriptionRef>> | undefined,
  segments: Segment[],
): unknown {
  const [nameSeg, fieldSeg, ...rest] = segments;
  if (!nameSeg || !fieldSeg) {
    throw new RuntimeExpressionError(
      `"${expression}" must reference $sourceDescriptions.<name>.<field>.`,
    );
  }
  requireNoSegments(expression, rest);
  return sourceDescriptions?.[nameSeg.key]?.[fieldSeg.key];
}

function findHeader(header: Record<string, string> | undefined, name: string): string | undefined {
  if (!header) return undefined;
  const lower = name.toLowerCase();
  const key = Object.keys(header).find((candidate) => candidate.toLowerCase() === lower);
  return key ? header[key] : undefined;
}

function requireNoSegments(expression: string, segments: Segment[]): void {
  if (segments.length > 0) {
    throw new RuntimeExpressionError(`"${expression}" has unexpected trailing segments.`);
  }
}

type Segment = { key: string; pointer?: string };

/** Splits `.a.b.c#/json/pointer` into dot segments, attaching a trailing JSON Pointer (if any) to the last. */
function splitSegments(rest: string): Segment[] {
  if (!rest) return [];
  const [dotted, pointer] = splitOnce(rest, "#");
  const parts = dotted.split(".").filter((part) => part.length > 0);
  return parts.map((key, index) => ({
    key,
    pointer: pointer !== undefined && index === parts.length - 1 ? pointer : undefined,
  }));
}

function splitOnce(value: string, separator: string): [string, string | undefined] {
  const index = value.indexOf(separator);
  return index === -1 ? [value, undefined] : [value.slice(0, index), value.slice(index + 1)];
}

/** Resolves an RFC 6901 JSON Pointer (e.g. `/data/id`) against a value; returns the value unchanged if no pointer. */
export function applyJsonPointer(value: unknown, pointer: string | undefined): unknown {
  if (!pointer) return value;
  if (pointer === "" || pointer === "/") return value;

  const tokens = pointer.split("/").slice(1).map(unescapeJsonPointerToken);
  let current: unknown = value;
  for (const token of tokens) {
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current)) {
      const index = token === "-" ? current.length : Number(token);
      current = Number.isInteger(index) ? current[index] : undefined;
    } else if (typeof current === "object") {
      current = (current as Record<string, unknown>)[token];
    } else {
      return undefined;
    }
  }
  return current;
}

function unescapeJsonPointerToken(token: string): string {
  return token.replace(/~1/g, "/").replace(/~0/g, "~");
}
