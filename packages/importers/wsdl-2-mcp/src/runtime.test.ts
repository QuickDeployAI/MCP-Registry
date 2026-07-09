import { describe, expect, it, vi } from "vitest";
import { createSoapExecutor, SoapFaultError } from "./index";

describe("createSoapExecutor", () => {
  it("sends a SOAP envelope with the selected action and returns the response body object", async () => {
    const fetch = vi.fn(
      async (_url: Parameters<typeof globalThis.fetch>[0], init?: RequestInit) => {
        expect(init).toBeDefined();
        if (!init) throw new Error("expected request init");
        expect(init.method).toBe("POST");
        expect(new Headers(init.headers).get("soapaction")).toBe(
          '"https://quickdeploy.ai/fixtures/wsdl/calculator/Add"',
        );
        expect(String(init.body)).toContain("<left>2</left>");
        expect(String(init.body)).toContain("<right>3</right>");
        return new Response(
          `<?xml version="1.0"?>
        <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
          <soap:Body>
            <AddResponse><sum>5</sum></AddResponse>
          </soap:Body>
        </soap:Envelope>`,
          { status: 200, headers: { "content-type": "text/xml" } },
        );
      },
    );
    const execute = createSoapExecutor({
      endpoint: "https://example.invalid/soap/calculator",
      soapAction: "https://quickdeploy.ai/fixtures/wsdl/calculator/Add",
      inputElement: "AddRequest",
      outputElement: "AddResponse",
      fetch,
    });

    await expect(execute({ left: 2, right: 3 })).resolves.toEqual({ sum: 5 });
  });

  it("maps SOAP faults into structured tool errors", async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          `<?xml version="1.0"?>
        <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
          <soap:Body>
            <soap:Fault>
              <faultcode>soap:Client</faultcode>
              <faultstring>Calculation rejected</faultstring>
              <detail>
                <CalculationFault>
                  <code>NEGATIVE_INPUT</code>
                  <message>Inputs must be non-negative.</message>
                </CalculationFault>
              </detail>
            </soap:Fault>
          </soap:Body>
        </soap:Envelope>`,
          { status: 500, headers: { "content-type": "text/xml" } },
        ),
    );
    const execute = createSoapExecutor({
      endpoint: "https://example.invalid/soap/calculator",
      soapAction: "https://quickdeploy.ai/fixtures/wsdl/calculator/Add",
      inputElement: "AddRequest",
      outputElement: "AddResponse",
      fetch,
    });

    await expect(execute({ left: -1, right: 3 })).rejects.toMatchObject({
      name: "SoapFaultError",
      faultCode: "soap:Client",
      faultString: "Calculation rejected",
      detail: {
        CalculationFault: {
          code: "NEGATIVE_INPUT",
          message: "Inputs must be non-negative.",
        },
      },
    } satisfies Partial<SoapFaultError>);
  });
});
