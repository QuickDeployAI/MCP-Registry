import { describe, expect, it, vi } from "vitest";
import { parseArazzoDocument } from "./index.js";
import type { SourceResolutionMap } from "./sources.js";
import { buildArazzoTools } from "./tools.js";

const document = parseArazzoDocument({
  arazzo: "1.0.1",
  info: { title: "Ticket workflows" },
  sourceDescriptions: [
    { name: "support-api", type: "openapi3", url: "https://spec.example/openapi.json" },
  ],
  workflows: [
    {
      workflowId: "create-ticket",
      summary: "Create a support ticket",
      inputs: {
        type: "object",
        properties: { customerId: { type: "string" } },
        required: ["customerId"],
      },
      steps: [
        {
          stepId: "create",
          operationId: "createTicket",
          parameters: [{ name: "customerId", in: "query", value: "$inputs.customerId" }],
        },
      ],
    },
    {
      workflowId: "close-ticket",
      steps: [{ stepId: "close", operationId: "closeTicket" }],
    },
  ],
});

const sources: SourceResolutionMap = new Map([
  [
    "support-api",
    {
      type: "openapi" as const,
      name: "support-api",
      document: {
        openapi: "3.1.0",
        info: { title: "Support", version: "1.0.0" },
        paths: {
          "/tickets": {
            post: { operationId: "createTicket", responses: { "201": { description: "Created" } } },
          },
          "/tickets/{id}/close": {
            post: { operationId: "closeTicket", responses: { "200": { description: "Closed" } } },
          },
        },
      },
    },
  ],
]);

describe("buildArazzoTools", () => {
  it("builds one executable tool per workflow using workflow inputs as its schema", async () => {
    const executor = vi.fn(async (request: { url: URL }) => ({
      status: 201,
      text: JSON.stringify({ url: request.url.href }),
    }));
    const tools = buildArazzoTools(document, {
      executor,
      sources,
      sourceOverrides: { "support-api": "https://runtime.example" },
    });

    expect(tools.map((tool) => tool.name)).toEqual(["create-ticket", "close-ticket"]);
    expect(tools[0]?.inputSchema).toEqual(document.workflows[0]?.inputs);

    await expect(tools[0]?.execute({ customerId: "cust-1" })).resolves.toMatchObject({
      workflowId: "create-ticket",
      steps: { create: { status: "success" } },
    });
    expect(executor).toHaveBeenCalledWith(
      expect.objectContaining({ url: new URL("https://runtime.example/tickets?customerId=cust-1") }),
    );
  });

  it("honors workflowAllowlist and supplies an empty object schema when inputs are absent", () => {
    const tools = buildArazzoTools(document, {
      executor: async () => ({ status: 200, text: "{}" }),
      sources,
      workflowAllowlist: ["close-ticket"],
    });

    expect(tools).toHaveLength(1);
    expect(tools[0]).toMatchObject({
      name: "close-ticket",
      inputSchema: { type: "object", additionalProperties: false },
    });
  });
});
