import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { convertWsdlToOpenApi } from "./index";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");

describe("convertWsdlToOpenApi", () => {
  it("preserves document/literal operations, imported XSD schemas, SOAP actions, and faults", async () => {
    const result = await convertWsdlToOpenApi({
      wsdlPath: join(fixturesDir, "calculator-document-literal.wsdl"),
    });

    expect(result.warnings).toEqual([]);
    expect(result.operations).toEqual([
      expect.objectContaining({
        name: "Add",
        toolName: "calculator_add",
        soapAction: "https://quickdeploy.ai/fixtures/wsdl/calculator/Add",
        endpoint: "https://example.invalid/soap/calculator",
        inputElement: "AddRequest",
        outputElement: "AddResponse",
        faults: [
          expect.objectContaining({
            name: "CalculationFault",
            element: "CalculationFault",
          }),
        ],
      }),
    ]);

    expect(result.openapi.openapi).toBe("3.1.0");
    expect(result.openapi.paths["/soap/CalculatorService/Add"]?.post).toMatchObject({
      operationId: "calculator_add",
      "x-quickdeploy-soap": {
        action: "https://quickdeploy.ai/fixtures/wsdl/calculator/Add",
        bindingStyle: "document",
        bodyUse: "literal",
        endpoint: "https://example.invalid/soap/calculator",
      },
    });
    expect(result.openapi.components.schemas.AddRequest).toMatchObject({
      type: "object",
      properties: {
        left: { type: "integer" },
        right: { type: "integer" },
        audit: { $ref: "#/components/schemas/AuditContext" },
      },
      required: ["left", "right"],
    });
    expect(result.openapi.components.schemas.AuditContext).toMatchObject({
      type: "object",
      properties: {
        requestId: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
      },
      required: ["requestId"],
    });
    expect(result.openapi.components.schemas.CalculationFault).toMatchObject({
      type: "object",
      properties: {
        code: { type: "string" },
        message: { type: "string" },
      },
      required: ["code", "message"],
    });
  });

  it("retains repeated fields, enums, and multiple named SOAP faults", async () => {
    const result = await convertWsdlToOpenApi({
      wsdlPath: join(fixturesDir, "customer-faults-document-literal.wsdl"),
    });

    expect(result.operations[0]?.faults.map((fault) => fault.name)).toEqual([
      "CustomerNotFoundFault",
      "PolicyFault",
    ]);
    expect(result.openapi.components.schemas.GetCustomerRequest).toMatchObject({
      type: "object",
      properties: {
        customerId: { type: "string" },
        include: {
          type: "array",
          items: {
            type: "string",
            enum: ["contacts", "contracts", "riskSignals"],
          },
        },
      },
      required: ["customerId"],
    });
  });

  it("accepts rpc/encoded WSDLs for cataloging with an explicit review warning", async () => {
    const result = await convertWsdlToOpenApi({
      wsdlPath: join(fixturesDir, "legacy-rpc-encoded.wsdl"),
    });

    expect(result.operations[0]).toMatchObject({
      name: "LookupInventory",
      compatibility: "rpc-encoded",
    });
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        code: "rpc-encoded-review",
        operation: "LookupInventory",
      }),
    );
    expect(
      result.openapi.paths["/soap/LegacyInventoryService/LookupInventory"]?.post,
    ).toMatchObject({
      operationId: "legacy_inventory_lookup_inventory",
      "x-quickdeploy-soap": {
        bindingStyle: "rpc",
        bodyUse: "encoded",
        compatibility: "rpc-encoded",
      },
    });
  });
});
