import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { ARAZZO_MEDIA_TYPE } from "@quickdeployai/registry-schemas";
import { arazzoToWorkflowCapabilities, loadArazzoDocument, parseArazzoDocument } from "./index";

describe("arazzo-2-mcp", () => {
  it("loads a sample Arazzo document into workflow derived capabilities", async () => {
    const document = await loadArazzoDocument(
      new URL("../fixtures/support-ticket.arazzo.json", import.meta.url),
    );

    const [capability] = arazzoToWorkflowCapabilities(document, {
      sourceUrl: "https://registry.example.test/support-ticket.arazzo.json",
      sourceArdEntries: [
        {
          identifier: "urn:air:api.example.test:api:support",
          type: "application/vnd.oai.openapi+json",
          url: "https://api.example.test/openapi.json",
          displayName: "support-api",
        },
      ],
    });

    expect(capability).toMatchObject({
      kind: "workflow",
      sourceMediaType: ARAZZO_MEDIA_TYPE,
      workflow: {
        workflow_id: "create-and-triage-ticket",
        title: "Create and triage ticket",
        version: "1.2.0",
        source_url: "https://registry.example.test/support-ticket.arazzo.json",
      },
    });
    expect(capability?.workflow.steps).toEqual([
      expect.objectContaining({
        id: "create-ticket",
        action: "createTicket",
        capability_ref: "support-api#createTicket",
        capability_type: "tool",
        source_description: "support-api",
      }),
      expect.objectContaining({
        id: "assign-ticket",
        action: "assignTicket",
        capability_ref: "support-api#assignTicket",
        depends_on: ["create-ticket"],
      }),
    ]);
    expect(capability?.workflow.required_capabilities).toEqual([
      expect.objectContaining({
        id: "support-api",
        type: "api-contract",
        ard_entry_identifier: "urn:air:api.example.test:api:support",
      }),
    ]);
  });

  it("keeps one workflow capability per Arazzo workflow", async () => {
    const raw = JSON.parse(
      await readFile(new URL("../fixtures/support-ticket.arazzo.json", import.meta.url), "utf8"),
    );
    raw.workflows.push({
      workflowId: "close-ticket",
      summary: "Close ticket",
      steps: [{ stepId: "close-ticket", operationId: "closeTicket" }],
    });

    const capabilities = arazzoToWorkflowCapabilities(parseArazzoDocument(raw));

    expect(capabilities.map((capability) => capability.workflow.workflow_id)).toEqual([
      "create-and-triage-ticket",
      "close-ticket",
    ]);
  });

  it("rejects Arazzo workflows without steps", () => {
    expect(() =>
      parseArazzoDocument({
        arazzo: "1.0.1",
        info: { title: "Broken" },
        workflows: [{ workflowId: "empty", steps: [] }],
      }),
    ).toThrow();
  });
});
