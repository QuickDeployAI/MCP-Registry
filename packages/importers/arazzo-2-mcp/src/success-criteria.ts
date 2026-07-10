import { ArazzoImportError } from "./index.js";
import {
  applyJsonPointer,
  evaluateRuntimeExpression,
  isRuntimeExpression,
  type RuntimeExpressionContext,
} from "./runtime-expressions.js";

export class SuccessCriteriaError extends ArazzoImportError {}

export type SuccessCriteriaKind = "simple" | "regex" | "jsonpath";

export type SuccessCriteriaObject = {
  condition: string;
  /** Runtime expression pointing at the value to test. Required for `regex`/`jsonpath`. */
  context?: string;
  type?: SuccessCriteriaKind;
};

/** Evaluates one Arazzo `successCriteria` entry against a step context. */
export function evaluateSuccessCriterion(
  criteria: SuccessCriteriaObject,
  context: RuntimeExpressionContext,
): boolean {
  const kind = criteria.type ?? "simple";
  switch (kind) {
    case "simple":
      return evaluateSimpleCondition(criteria.condition, context);
    case "regex":
      return evaluateRegexCondition(criteria, context);
    case "jsonpath":
      return evaluateJsonPathCondition(criteria, context);
    default:
      throw new SuccessCriteriaError(`Unsupported successCriteria type: "${kind}".`);
  }
}

/** True only if every criterion in the list passes (Arazzo requires all `successCriteria` to hold). */
export function evaluateSuccessCriteria(
  criteria: readonly SuccessCriteriaObject[],
  context: RuntimeExpressionContext,
): boolean {
  return criteria.every((criterion) => evaluateSuccessCriterion(criterion, context));
}

const COMPARISON_OPERATORS = ["==", "!=", ">=", "<=", ">", "<"] as const;
type ComparisonOperator = (typeof COMPARISON_OPERATORS)[number];

function evaluateSimpleCondition(condition: string, context: RuntimeExpressionContext): boolean {
  const parsed = splitComparison(condition);
  if (!parsed) {
    return toBoolean(resolveOperand(condition.trim(), context));
  }

  const left = resolveOperand(parsed.left, context);
  const right = resolveOperand(parsed.right, context);
  return compare(left, right, parsed.operator);
}

function splitComparison(
  condition: string,
): { left: string; operator: ComparisonOperator; right: string } | undefined {
  for (const operator of COMPARISON_OPERATORS) {
    const index = condition.indexOf(operator);
    if (index === -1) continue;
    return {
      left: condition.slice(0, index).trim(),
      operator,
      right: condition.slice(index + operator.length).trim(),
    };
  }
  return undefined;
}

function resolveOperand(token: string, context: RuntimeExpressionContext): unknown {
  if (isRuntimeExpression(token)) return evaluateRuntimeExpression(token, context);
  return parseLiteral(token);
}

function parseLiteral(token: string): unknown {
  if (
    (token.startsWith("'") && token.endsWith("'")) ||
    (token.startsWith('"') && token.endsWith('"'))
  ) {
    return token.slice(1, -1);
  }
  if (token === "true") return true;
  if (token === "false") return false;
  if (token === "null") return null;
  if (token.length > 0 && !Number.isNaN(Number(token))) return Number(token);
  return token;
}

function compare(left: unknown, right: unknown, operator: ComparisonOperator): boolean {
  if (operator === "==") return left === right;
  if (operator === "!=") return left !== right;

  const pair = orderablePair(left, right);
  if (!pair) return false;
  const [orderedLeft, orderedRight] = pair;
  switch (operator) {
    case ">":
      return orderedLeft > orderedRight;
    case "<":
      return orderedLeft < orderedRight;
    case ">=":
      return orderedLeft >= orderedRight;
    case "<=":
      return orderedLeft <= orderedRight;
  }
}

function orderablePair(left: unknown, right: unknown): [number, number] | [string, string] | undefined {
  if (typeof left === "number" && typeof right === "number") return [left, right];
  if (typeof left === "string" && typeof right === "string") return [left, right];
  return undefined;
}

function toBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (value === null || value === undefined) return false;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return value.length > 0;
  return true;
}

function evaluateRegexCondition(
  criteria: SuccessCriteriaObject,
  context: RuntimeExpressionContext,
): boolean {
  const value = resolveContextValue(criteria, context);
  return new RegExp(criteria.condition).test(stringifyForMatch(value));
}

function stringifyForMatch(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value ?? "");
}

function evaluateJsonPathCondition(
  criteria: SuccessCriteriaObject,
  context: RuntimeExpressionContext,
): boolean {
  const value = resolveContextValue(criteria, context);
  return queryJsonPath(value, criteria.condition).length > 0;
}

function resolveContextValue(
  criteria: SuccessCriteriaObject,
  context: RuntimeExpressionContext,
): unknown {
  if (!criteria.context) {
    throw new SuccessCriteriaError(
      `successCriteria of type "${criteria.type}" requires a "context" runtime expression.`,
    );
  }
  return evaluateRuntimeExpression(criteria.context, context);
}

/**
 * A practical JSONPath subset: `$`, dot/bracket property access, numeric indices, `*` wildcard,
 * and an equality filter `[?(@.field=='value')]` / `[?(@.field==123)]`. Sufficient for the
 * existence-based `jsonpath` successCriteria semantics used by Arazzo tooling: the condition
 * passes when the query yields at least one match.
 */
export function queryJsonPath(value: unknown, path: string): unknown[] {
  const tokens = tokenizeJsonPath(path);
  let current: unknown[] = [value];
  for (const token of tokens) {
    current = current.flatMap((item) => applyJsonPathToken(item, token));
  }
  return current;
}

type JsonPathToken =
  | { kind: "property"; name: string }
  | { kind: "wildcard" }
  | { kind: "filter"; field: string; value: unknown };

function tokenizeJsonPath(path: string): JsonPathToken[] {
  const trimmed = path.trim();
  const body = trimmed.startsWith("$") ? trimmed.slice(1) : trimmed;
  const tokens: JsonPathToken[] = [];
  const pattern = /\.([a-zA-Z0-9_]+)|\[(\*)\]|\[\?\(@\.([a-zA-Z0-9_]+)\s*==\s*('([^']*)'|"([^"]*)"|-?\d+(?:\.\d+)?|true|false)\)\]|\[(\d+)\]|\[(?:'|")([^'"]+)(?:'|")\]/g;
  let match: RegExpExecArray | null;
  let lastIndex = 0;
  while ((match = pattern.exec(body)) !== null) {
    if (match.index !== lastIndex) {
      throw new SuccessCriteriaError(`Unsupported JSONPath syntax near "${body.slice(lastIndex)}".`);
    }
    lastIndex = pattern.lastIndex;
    if (match[1] !== undefined) tokens.push({ kind: "property", name: match[1] });
    else if (match[2] !== undefined) tokens.push({ kind: "wildcard" });
    else if (match[3] !== undefined) {
      tokens.push({ kind: "filter", field: match[3], value: parseFilterValue(match[4]!) });
    } else if (match[7] !== undefined) tokens.push({ kind: "property", name: match[7] });
    else if (match[8] !== undefined) tokens.push({ kind: "property", name: match[8] });
  }
  if (lastIndex !== body.length) {
    throw new SuccessCriteriaError(`Unsupported JSONPath syntax near "${body.slice(lastIndex)}".`);
  }
  return tokens;
}

function parseFilterValue(raw: string): unknown {
  if (raw === "true") return true;
  if (raw === "false") return false;
  if ((raw.startsWith("'") && raw.endsWith("'")) || (raw.startsWith('"') && raw.endsWith('"'))) {
    return raw.slice(1, -1);
  }
  return Number(raw);
}

function applyJsonPathToken(value: unknown, token: JsonPathToken): unknown[] {
  if (token.kind === "property") {
    if (value === null || typeof value !== "object") return [];
    const resolved = applyJsonPointer(value, `/${token.name}`);
    return resolved === undefined && !(token.name in (value as Record<string, unknown>))
      ? []
      : [resolved];
  }
  if (token.kind === "wildcard") {
    if (Array.isArray(value)) return value;
    if (value !== null && typeof value === "object") return Object.values(value);
    return [];
  }
  const items = Array.isArray(value) ? value : value !== null && typeof value === "object" ? Object.values(value as Record<string, unknown>) : [];
  return items.filter(
    (item) =>
      item !== null &&
      typeof item === "object" &&
      (item as Record<string, unknown>)[token.field] === token.value,
  );
}
