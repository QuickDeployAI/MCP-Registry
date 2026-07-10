import { describe, expect, it } from "vitest";
import {
  evaluateRuntimeExpression,
  isRuntimeExpression,
  RuntimeExpressionError,
  type RuntimeExpressionContext,
} from "./runtime-expressions.js";

const context: RuntimeExpressionContext = {
  inputs: { customerId: "cust_1", payload: { id: "abc", nested: { flag: true } } },
  steps: {
    "create-ticket": {
      outputs: { ticketId: "tick_1" },
      response: {
        statusCode: 201,
        header: { "X-Request-Id": "req_1", "Content-Type": "application/json" },
        body: { data: { id: "tick_1", status: "open" } },
      },
    },
  },
  sourceDescriptions: {
    "support-api": { url: "https://api.example.test/openapi.json", type: "openapi3" },
  },
  response: {
    statusCode: 200,
    header: { "Content-Type": "application/json" },
    body: { data: { id: "current" } },
  },
};

describe("evaluateRuntimeExpression", () => {
  it("resolves $statusCode against the current response", () => {
    expect(evaluateRuntimeExpression("$statusCode", context)).toBe(200);
  });

  it("resolves $response.body with a JSON pointer", () => {
    expect(evaluateRuntimeExpression("$response.body#/data/id", context)).toBe("current");
  });

  it("resolves $response.header.<name> case-insensitively", () => {
    expect(evaluateRuntimeExpression("$response.header.content-type", context)).toBe(
      "application/json",
    );
  });

  it("resolves $inputs.<name>", () => {
    expect(evaluateRuntimeExpression("$inputs.customerId", context)).toBe("cust_1");
  });

  it("resolves $inputs.<name> with a JSON pointer", () => {
    expect(evaluateRuntimeExpression("$inputs.payload#/nested/flag", context)).toBe(true);
  });

  it("resolves $steps.<id>.outputs.<name>", () => {
    expect(evaluateRuntimeExpression("$steps.create-ticket.outputs.ticketId", context)).toBe(
      "tick_1",
    );
  });

  it("resolves $steps.<id>.response.statusCode", () => {
    expect(evaluateRuntimeExpression("$steps.create-ticket.response.statusCode", context)).toBe(
      201,
    );
  });

  it("resolves $steps.<id>.response.body with a JSON pointer", () => {
    expect(
      evaluateRuntimeExpression("$steps.create-ticket.response.body#/data/status", context),
    ).toBe("open");
  });

  it("resolves $sourceDescriptions.<name>.<field>", () => {
    expect(evaluateRuntimeExpression("$sourceDescriptions.support-api.url", context)).toBe(
      "https://api.example.test/openapi.json",
    );
  });

  it("throws for an unknown expression keyword", () => {
    expect(() => evaluateRuntimeExpression("$bogus.thing", context)).toThrow(
      RuntimeExpressionError,
    );
  });

  it("throws when a value isn't a runtime expression at all", () => {
    expect(() => evaluateRuntimeExpression("statusCode", context)).toThrow(
      RuntimeExpressionError,
    );
  });
});

describe("isRuntimeExpression", () => {
  it("recognizes runtime expressions and rejects literals", () => {
    expect(isRuntimeExpression("$statusCode")).toBe(true);
    expect(isRuntimeExpression("200")).toBe(false);
    expect(isRuntimeExpression("'ok'")).toBe(false);
  });
});
