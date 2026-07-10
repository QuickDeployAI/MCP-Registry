import type { HttpExecutor } from "@quickdeployai/proxy-core/openapi";
import type { OpenAPIV3 } from "openapi-types";
import { describe, expect, it } from "vitest";
import { parseArazzoDocument } from "./index.js";
import { runWorkflow, WorkflowRunError } from "./runner.js";
import type { SourceResolutionMap } from "./sources.js";

const supportApiDocument: OpenAPIV3.Document = {
  openapi: "3.0.3",
  info: { title: "Support API", version: "1.0.0" },
  servers: [{ url: "https://api.example.test" }],
  paths: {
    "/tickets": {
      post: {
        operationId: "createTicket",
        responses: { "201": { description: "Created" } },
      },
    },
    "/tickets/{ticketId}/assignee": {
      post: {
        operationId: "assignTicket",
        parameters: [{ name: "ticketId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Assigned" } },
      },
    },
    "/flaky": {
      post: {
        operationId: "flakyOp",
        responses: { "200": { description: "OK" } },
      },
    },
  },
};

const sources: SourceResolutionMap = new Map([
  ["support-api", { type: "openapi", name: "support-api", document: supportApiDocument }],
]);

function sourceDescription(name: string) {
  return { name, type: "openapi3", url: `https://registry.example.test/${name}.json` };
}

describe("runWorkflow — happy path + output threading", () => {
  it("threads a step output into the next step's parameter and into workflow outputs", async () => {
    const calls: string[] = [];
    const executor: HttpExecutor = async ({ url, method }) => {
      calls.push(`${method} ${url.pathname}`);
      if (url.pathname === "/tickets" && method === "POST") {
        return { status: 201, text: JSON.stringify({ id: "tick_1" }) };
      }
      if (url.pathname === "/tickets/tick_1/assignee" && method === "POST") {
        return { status: 200, text: JSON.stringify({ assignee: "agent_7" }) };
      }
      return { status: 404, text: "" };
    };

    const document = parseArazzoDocument({
      arazzo: "1.0.1",
      info: { title: "Support", version: "1.0.0" },
      sourceDescriptions: [sourceDescription("support-api")],
      workflows: [
        {
          workflowId: "create-and-assign",
          steps: [
            {
              stepId: "create-ticket",
              operationId: "createTicket",
              requestBody: { payload: { customerId: "$inputs.customerId" } },
              outputs: { ticketId: "$response.body#/id" },
            },
            {
              stepId: "assign-ticket",
              operationId: "assignTicket",
              parameters: [
                { name: "ticketId", in: "path", value: "$steps.create-ticket.outputs.ticketId" },
              ],
              outputs: { assignee: "$response.body#/assignee" },
            },
          ],
          outputs: {
            ticketId: "$steps.create-ticket.outputs.ticketId",
            assignee: "$steps.assign-ticket.outputs.assignee",
          },
        },
      ],
    });

    const result = await runWorkflow(document, "create-and-assign", { customerId: "cust_1" }, {
      executor,
      sources,
    });

    expect(result.outputs).toEqual({ ticketId: "tick_1", assignee: "agent_7" });
    expect(result.steps["create-ticket"]?.status).toBe("success");
    expect(result.steps["assign-ticket"]?.status).toBe("success");
    expect(calls).toEqual(["POST /tickets", "POST /tickets/tick_1/assignee"]);
  });
});

describe("runWorkflow — successCriteria failure routes via onFailure goto", () => {
  it("jumps to the fallback step when successCriteria fails", async () => {
    let attempt = 0;
    const executor: HttpExecutor = async () => {
      attempt++;
      return attempt === 1 ? { status: 500, text: "" } : { status: 200, text: "{}" };
    };

    const document = parseArazzoDocument({
      arazzo: "1.0.1",
      info: { title: "Support", version: "1.0.0" },
      sourceDescriptions: [sourceDescription("support-api")],
      workflows: [
        {
          workflowId: "check-then-fallback",
          steps: [
            {
              stepId: "check",
              operationId: "flakyOp",
              successCriteria: [{ condition: "$statusCode == 200" }],
              onFailure: [{ type: "goto", stepId: "fallback" }],
            },
            { stepId: "fallback", operationId: "flakyOp" },
          ],
        },
      ],
    });

    const result = await runWorkflow(document, "check-then-fallback", {}, { executor, sources });

    expect(result.steps.check?.status).toBe("failure");
    expect(result.steps.fallback?.status).toBe("success");
    expect(attempt).toBe(2);
  });

  it("throws when a step fails and no onFailure action handles it", async () => {
    const executor: HttpExecutor = async () => ({ status: 500, text: "" });

    const document = parseArazzoDocument({
      arazzo: "1.0.1",
      info: { title: "Support", version: "1.0.0" },
      sourceDescriptions: [sourceDescription("support-api")],
      workflows: [
        {
          workflowId: "unhandled-failure",
          steps: [
            {
              stepId: "check",
              operationId: "flakyOp",
              successCriteria: [{ condition: "$statusCode == 200" }],
            },
          ],
        },
      ],
    });

    await expect(runWorkflow(document, "unhandled-failure", {}, { executor, sources })).rejects.toThrow(
      WorkflowRunError,
    );
  });
});

describe("runWorkflow — retry", () => {
  it("retries the same step until successCriteria passes, within retryLimit", async () => {
    let attempt = 0;
    const executor: HttpExecutor = async () => {
      attempt++;
      return attempt < 2 ? { status: 500, text: "" } : { status: 200, text: "{}" };
    };

    const document = parseArazzoDocument({
      arazzo: "1.0.1",
      info: { title: "Support", version: "1.0.0" },
      sourceDescriptions: [sourceDescription("support-api")],
      workflows: [
        {
          workflowId: "retry-then-succeed",
          steps: [
            {
              stepId: "flaky",
              operationId: "flakyOp",
              successCriteria: [{ condition: "$statusCode == 200" }],
              onFailure: [{ type: "retry", retryLimit: 2 }],
            },
          ],
        },
      ],
    });

    const result = await runWorkflow(document, "retry-then-succeed", {}, { executor, sources });

    expect(result.steps.flaky?.status).toBe("success");
    expect(result.steps.flaky?.attempts).toBe(2);
  });

  it("throws once retryLimit is exceeded", async () => {
    const executor: HttpExecutor = async () => ({ status: 500, text: "" });

    const document = parseArazzoDocument({
      arazzo: "1.0.1",
      info: { title: "Support", version: "1.0.0" },
      sourceDescriptions: [sourceDescription("support-api")],
      workflows: [
        {
          workflowId: "retry-exhausted",
          steps: [
            {
              stepId: "flaky",
              operationId: "flakyOp",
              successCriteria: [{ condition: "$statusCode == 200" }],
              onFailure: [{ type: "retry", retryLimit: 1 }],
            },
          ],
        },
      ],
    });

    await expect(runWorkflow(document, "retry-exhausted", {}, { executor, sources })).rejects.toThrow(
      WorkflowRunError,
    );
  });
});

describe("runWorkflow — sub-workflow", () => {
  it("invokes a nested workflow and threads its outputs back", async () => {
    const executor: HttpExecutor = async ({ url }) => {
      if (url.pathname === "/tickets") return { status: 201, text: JSON.stringify({ id: "tick_9" }) };
      return { status: 404, text: "" };
    };

    const document = parseArazzoDocument({
      arazzo: "1.0.1",
      info: { title: "Support", version: "1.0.0" },
      sourceDescriptions: [sourceDescription("support-api")],
      workflows: [
        {
          workflowId: "parent",
          steps: [
            {
              stepId: "delegate",
              workflowId: "child",
              parameters: [{ name: "customerId", value: "$inputs.customerId" }],
            },
          ],
          outputs: { ticketId: "$steps.delegate.outputs.ticketId" },
        },
        {
          workflowId: "child",
          steps: [
            {
              stepId: "create-ticket",
              operationId: "createTicket",
              requestBody: { payload: { customerId: "$inputs.customerId" } },
              outputs: { ticketId: "$response.body#/id" },
            },
          ],
          outputs: { ticketId: "$steps.create-ticket.outputs.ticketId" },
        },
      ],
    });

    const result = await runWorkflow(document, "parent", { customerId: "cust_9" }, { executor, sources });

    expect(result.outputs).toEqual({ ticketId: "tick_9" });
    expect(result.steps.delegate?.status).toBe("success");
  });
});

describe("runWorkflow — guards", () => {
  it("enforces maxSteps", async () => {
    const executor: HttpExecutor = async () => ({ status: 200, text: "{}" });

    const document = parseArazzoDocument({
      arazzo: "1.0.1",
      info: { title: "Support", version: "1.0.0" },
      sourceDescriptions: [sourceDescription("support-api")],
      workflows: [
        {
          workflowId: "two-steps",
          steps: [
            { stepId: "one", operationId: "flakyOp" },
            { stepId: "two", operationId: "flakyOp" },
          ],
        },
      ],
    });

    await expect(
      runWorkflow(document, "two-steps", {}, { executor, sources, maxSteps: 1 }),
    ).rejects.toThrow(WorkflowRunError);
  });

  it("enforces stepTimeoutMs", async () => {
    const executor: HttpExecutor = () =>
      new Promise((resolve) => setTimeout(() => resolve({ status: 200, text: "{}" }), 50));

    const document = parseArazzoDocument({
      arazzo: "1.0.1",
      info: { title: "Support", version: "1.0.0" },
      sourceDescriptions: [sourceDescription("support-api")],
      workflows: [
        {
          workflowId: "slow",
          steps: [{ stepId: "one", operationId: "flakyOp" }],
        },
      ],
    });

    await expect(
      runWorkflow(document, "slow", {}, { executor, sources, stepTimeoutMs: 10 }),
    ).rejects.toThrow(WorkflowRunError);
  });
});
