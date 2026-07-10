import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parseArazzoDocument } from "./index.js";
import {
  indexOpenApiOperations,
  resolveArazzoSources,
  resolveOperation,
  SourceResolutionError,
} from "./sources.js";

const supportApiUrl = new URL("../fixtures/support-api.openapi.json", import.meta.url);
const nestedWorkflowUrl = new URL("../fixtures/nested-close-ticket.arazzo.json", import.meta.url);

async function loadDocument(url: URL) {
  return parseArazzoDocument(JSON.parse(await readFile(url, "utf8")));
}

describe("resolveArazzoSources / resolveOperation", () => {
  it("resolves an operation by operationId", async () => {
    const document = await loadDocument(nestedWorkflowUrl);
    document.sourceDescriptions[0]!.url = supportApiUrl.href;

    const sources = await resolveArazzoSources(document);
    const resolved = resolveOperation(sources, "support-api", { operationId: "createTicket" });

    expect(resolved).toMatchObject({
      sourceName: "support-api",
      method: "post",
      path: "/tickets",
      operationId: "createTicket",
    });
  });

  it("resolves an operation by operationPath (JSON pointer)", async () => {
    const document = await loadDocument(nestedWorkflowUrl);
    document.sourceDescriptions[0]!.url = supportApiUrl.href;

    const sources = await resolveArazzoSources(document);
    const resolved = resolveOperation(sources, "support-api", {
      operationPath: "/paths/~1tickets~1{ticketId}~1assignee/post",
    });

    expect(resolved.operationId).toBe("assignTicket");
    expect(resolved.method).toBe("post");
  });

  it("throws a clear error for an unknown source", async () => {
    const document = await loadDocument(nestedWorkflowUrl);
    document.sourceDescriptions[0]!.url = supportApiUrl.href;

    const sources = await resolveArazzoSources(document);
    expect(() => resolveOperation(sources, "does-not-exist", { operationId: "createTicket" }))
      .toThrow(SourceResolutionError);
  });

  it("throws a clear error when the operationId is missing from the source", async () => {
    const document = await loadDocument(nestedWorkflowUrl);
    document.sourceDescriptions[0]!.url = supportApiUrl.href;

    const sources = await resolveArazzoSources(document);
    expect(() => resolveOperation(sources, "support-api", { operationId: "doesNotExist" }))
      .toThrow(SourceResolutionError);
  });

  it("resolves nested Arazzo sourceDescriptions recursively", async () => {
    const document = parseArazzoDocument({
      arazzo: "1.0.1",
      info: { title: "Parent", version: "1.0.0" },
      sourceDescriptions: [
        { name: "nested-workflow", type: "arazzo", url: nestedWorkflowUrl.href },
      ],
      workflows: [
        { workflowId: "parent", steps: [{ stepId: "delegate", workflowId: "close-ticket" }] },
      ],
    });

    const sources = await resolveArazzoSources(document);
    const nested = sources.get("nested-workflow");

    expect(nested?.type).toBe("arazzo");
    if (nested?.type !== "arazzo") throw new Error("expected nested arazzo source");
    expect(nested.document.workflows[0]?.workflowId).toBe("close-ticket");
    expect(nested.sources.get("support-api")?.type).toBe("openapi");
  });
});

describe("indexOpenApiOperations", () => {
  it("indexes every operation by operationId and JSON-pointer operationPath", async () => {
    const document = JSON.parse(await readFile(supportApiUrl, "utf8"));
    const index = indexOpenApiOperations(document);

    expect(index.byOperationId.get("createTicket")).toMatchObject({
      method: "post",
      path: "/tickets",
      operationPath: "/paths/~1tickets/post",
    });
    expect(index.byOperationPath.get("/paths/~1tickets~1{ticketId}~1assignee/post")).toMatchObject(
      { operationId: "assignTicket" },
    );
  });
});
