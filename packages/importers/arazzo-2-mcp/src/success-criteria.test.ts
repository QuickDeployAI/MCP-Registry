import { describe, expect, it } from "vitest";
import type { RuntimeExpressionContext } from "./runtime-expressions.js";
import {
  evaluateSuccessCriteria,
  evaluateSuccessCriterion,
  SuccessCriteriaError,
} from "./success-criteria.js";

const context: RuntimeExpressionContext = {
  response: {
    statusCode: 201,
    header: {},
    body: {
      status: "open",
      items: [
        { id: 1, status: "open" },
        { id: 2, status: "closed" },
      ],
    },
  },
};

describe("evaluateSuccessCriterion — simple", () => {
  it("evaluates a numeric comparison", () => {
    expect(evaluateSuccessCriterion({ condition: "$statusCode == 201" }, context)).toBe(true);
    expect(evaluateSuccessCriterion({ condition: "$statusCode == 200" }, context)).toBe(false);
  });

  it("evaluates a string comparison", () => {
    expect(
      evaluateSuccessCriterion({ condition: "$response.body#/status == 'open'" }, context),
    ).toBe(true);
  });

  it("treats a bare runtime expression as a truthy check", () => {
    expect(evaluateSuccessCriterion({ condition: "$response.body#/status" }, context)).toBe(true);
  });

  it("supports >= and <=", () => {
    expect(evaluateSuccessCriterion({ condition: "$statusCode >= 200" }, context)).toBe(true);
    expect(evaluateSuccessCriterion({ condition: "$statusCode <= 200" }, context)).toBe(false);
  });
});

describe("evaluateSuccessCriterion — regex", () => {
  it("matches the context value against the pattern", () => {
    expect(
      evaluateSuccessCriterion(
        { type: "regex", context: "$response.body#/status", condition: "^open$" },
        context,
      ),
    ).toBe(true);
    expect(
      evaluateSuccessCriterion(
        { type: "regex", context: "$response.body#/status", condition: "^closed$" },
        context,
      ),
    ).toBe(false);
  });

  it("requires a context expression", () => {
    expect(() =>
      evaluateSuccessCriterion({ type: "regex", condition: "^open$" }, context),
    ).toThrow(SuccessCriteriaError);
  });
});

describe("evaluateSuccessCriterion — jsonpath", () => {
  it("passes when the query returns a match", () => {
    expect(
      evaluateSuccessCriterion(
        {
          type: "jsonpath",
          context: "$response.body",
          condition: "$.items[?(@.status=='open')]",
        },
        context,
      ),
    ).toBe(true);
  });

  it("fails when the query returns no matches", () => {
    expect(
      evaluateSuccessCriterion(
        {
          type: "jsonpath",
          context: "$response.body",
          condition: "$.items[?(@.status=='missing')]",
        },
        context,
      ),
    ).toBe(false);
  });

  it("supports wildcard property extraction", () => {
    expect(
      evaluateSuccessCriterion(
        { type: "jsonpath", context: "$response.body", condition: "$.items[*].id" },
        context,
      ),
    ).toBe(true);
  });
});

describe("evaluateSuccessCriteria", () => {
  it("requires every criterion to pass", () => {
    expect(
      evaluateSuccessCriteria(
        [{ condition: "$statusCode == 201" }, { condition: "$response.body#/status == 'open'" }],
        context,
      ),
    ).toBe(true);

    expect(
      evaluateSuccessCriteria(
        [{ condition: "$statusCode == 201" }, { condition: "$response.body#/status == 'closed'" }],
        context,
      ),
    ).toBe(false);
  });
});
