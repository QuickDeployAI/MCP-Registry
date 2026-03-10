/**
 * RSQL/FIQL-like filter parser and evaluator.
 *
 * Supported grammar (simplified RSQL):
 *
 *   expression  = constraint ( ( ";" | "," ) constraint )*
 *   constraint  = group | comparison
 *   group       = "(" expression ")"
 *   comparison  = selector operator value
 *   selector    = identifier
 *   operator    = "==" | "!=" | "=gt=" | "=ge=" | "=lt=" | "=le=" | "=like=" | "=contains="
 *   value       = string | number | boolean
 *
 *   ";"  = AND
 *   ","  = OR
 *
 * Wildcards: value may contain "*" (matches any substring) when using == / !=.
 */
import { FILTERABLE_FIELDS } from "../schema.js";
import { NATIVE_TO_INTERNAL } from "../introspection/field-aliases.js";
import type { FeedItem } from "../types.js";

// ---------------------------------------------------------------------------
// AST types
// ---------------------------------------------------------------------------

type Operator =
  | "=="
  | "!="
  | "=gt="
  | "=ge="
  | "=lt="
  | "=le="
  | "=like="
  | "=contains=";

interface Comparison {
  kind: "comparison";
  field: string;
  op: Operator;
  value: string;
}

interface LogicalAnd {
  kind: "and";
  left: AstNode;
  right: AstNode;
}

interface LogicalOr {
  kind: "or";
  left: AstNode;
  right: AstNode;
}

type AstNode = Comparison | LogicalAnd | LogicalOr;

// ---------------------------------------------------------------------------
// Tokeniser
// ---------------------------------------------------------------------------

const OPERATORS: Operator[] = [
  "=contains=",
  "=like=",
  "=ge=",
  "=gt=",
  "=le=",
  "=lt=",
  "==",
  "!=",
];

interface Token {
  type: "field" | "op" | "value" | "semi" | "comma" | "lparen" | "rparen";
  value: string;
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    // Skip whitespace
    if (/\s/.test(input[i])) { i++; continue; }

    if (input[i] === "(") { tokens.push({ type: "lparen", value: "(" }); i++; continue; }
    if (input[i] === ")") { tokens.push({ type: "rparen", value: ")" }); i++; continue; }
    if (input[i] === ";") { tokens.push({ type: "semi", value: ";" }); i++; continue; }
    if (input[i] === ",") { tokens.push({ type: "comma", value: "," }); i++; continue; }

    // Operators
    let matchedOp = false;
    for (const op of OPERATORS) {
      if (input.startsWith(op, i)) {
        tokens.push({ type: "op", value: op });
        i += op.length;
        matchedOp = true;
        break;
      }
    }
    if (matchedOp) continue;

    // Quoted string value
    if (input[i] === '"' || input[i] === "'") {
      const quote = input[i++];
      let str = "";
      while (i < input.length && input[i] !== quote) {
        if (input[i] === "\\" && i + 1 < input.length) { str += input[++i]; }
        else { str += input[i]; }
        i++;
      }
      i++; // closing quote
      tokens.push({ type: "value", value: str });
      continue;
    }

    // Unquoted identifier / value (letters, digits, -, _, ., :, T, Z, +, *, /)
    const match = input.slice(i).match(/^[A-Za-z0-9\-_.+:*/%TZ]+/);
    if (match) {
      // Determine if this is a field name or a bare value based on context
      tokens.push({ type: "field", value: match[0] });
      i += match[0].length;
      continue;
    }

    throw new Error(`Unexpected character '${input[i]}' at position ${i} in filter: ${input}`);
  }

  return tokens;
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

class FilterParser {
  private pos = 0;
  constructor(private tokens: Token[]) {}

  private peek(): Token | undefined { return this.tokens[this.pos]; }
  private consume(): Token {
    const t = this.tokens[this.pos++];
    if (!t) throw new Error("Unexpected end of filter expression");
    return t;
  }

  parse(): AstNode {
    const node = this.parseOr();
    if (this.pos < this.tokens.length) {
      throw new Error(`Unexpected token '${this.peek()?.value}' after filter expression`);
    }
    return node;
  }

  // OR = AND ("," AND)*
  private parseOr(): AstNode {
    let left = this.parseAnd();
    while (this.peek()?.type === "comma") {
      this.consume();
      const right = this.parseAnd();
      left = { kind: "or", left, right };
    }
    return left;
  }

  // AND = primary (";" primary)*
  private parseAnd(): AstNode {
    let left = this.parsePrimary();
    while (this.peek()?.type === "semi") {
      this.consume();
      const right = this.parsePrimary();
      left = { kind: "and", left, right };
    }
    return left;
  }

  private parsePrimary(): AstNode {
    if (this.peek()?.type === "lparen") {
      this.consume();
      const node = this.parseOr();
      const close = this.consume();
      if (close.type !== "rparen") throw new Error("Expected closing ')'");
      return node;
    }
    return this.parseComparison();
  }

  private parseComparison(): Comparison {
    const fieldTok = this.consume();
    if (fieldTok.type !== "field") {
      throw new Error(`Expected field name, got '${fieldTok.value}'`);
    }
    const opTok = this.consume();
    if (opTok.type !== "op") {
      throw new Error(`Expected operator after '${fieldTok.value}', got '${opTok.value}'`);
    }
    const valTok = this.consume();
    if (valTok.type !== "value" && valTok.type !== "field") {
      throw new Error(`Expected value after operator, got '${valTok.value}'`);
    }

    // Resolve native name (e.g. "pubDate") to internal FeedItem field (e.g. "publishedAt")
    const resolvedField = NATIVE_TO_INTERNAL.get(fieldTok.value) ?? fieldTok.value;

    if (!FILTERABLE_FIELDS.has(resolvedField)) {
      throw new Error(
        `Field '${fieldTok.value}' is not filterable. Filterable fields: ${[...FILTERABLE_FIELDS].join(", ")}`,
      );
    }

    return {
      kind: "comparison",
      field: resolvedField, // always store the resolved internal name
      op: opTok.value as Operator,
      value: valTok.value,
    };
  }
}

// ---------------------------------------------------------------------------
// Evaluator
// ---------------------------------------------------------------------------

function getField(item: FeedItem, field: string): unknown {
  return (item as unknown as Record<string, unknown>)[field];
}

function wildcardMatch(pattern: string, value: string): boolean {
  if (!pattern.includes("*")) return pattern.toLowerCase() === value.toLowerCase();
  const regex = new RegExp(
    "^" + pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$",
    "i",
  );
  return regex.test(value);
}

function coerceToString(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

function coerceToDate(v: string): number {
  const d = Date.parse(v);
  if (isNaN(d)) throw new Error(`Cannot parse '${v}' as a date`);
  return d;
}

function evaluateComparison(node: Comparison, item: FeedItem): boolean {
  const raw = getField(item, node.field);
  const filterVal = node.value;

  switch (node.op) {
    case "==":
      if (typeof raw === "boolean") return raw === (filterVal === "true");
      return wildcardMatch(filterVal, coerceToString(raw));

    case "!=":
      if (typeof raw === "boolean") return raw !== (filterVal === "true");
      return !wildcardMatch(filterVal, coerceToString(raw));

    case "=gt=":
      return coerceToDate(coerceToString(raw)) > coerceToDate(filterVal);
    case "=ge=":
      return coerceToDate(coerceToString(raw)) >= coerceToDate(filterVal);
    case "=lt=":
      return coerceToDate(coerceToString(raw)) < coerceToDate(filterVal);
    case "=le=":
      return coerceToDate(coerceToString(raw)) <= coerceToDate(filterVal);

    case "=like=":
      return wildcardMatch(filterVal, coerceToString(raw));

    case "=contains=": {
      if (!Array.isArray(raw)) return false;
      return (raw as string[]).some((entry) =>
        wildcardMatch(filterVal, entry),
      );
    }

    default:
      throw new Error(`Unknown operator: ${node.op}`);
  }
}

function evaluateNode(node: AstNode, item: FeedItem): boolean {
  switch (node.kind) {
    case "comparison": return evaluateComparison(node, item);
    case "and": return evaluateNode(node.left, item) && evaluateNode(node.right, item);
    case "or":  return evaluateNode(node.left, item) || evaluateNode(node.right, item);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface CompiledFilter {
  test: (item: FeedItem) => boolean;
}

export function compileFilter(expression: string): CompiledFilter {
  const tokens = tokenize(expression);
  // Re-classify token types based on position (field vs. value depends on context)
  const ast = new FilterParser(tokens).parse();
  return { test: (item) => evaluateNode(ast, item) };
}
