# @quickdeployai/wsdl-2-mcp

WSDL importer utilities for the QuickDeploy MCP manifest path. The importer turns a SOAP WSDL into an OpenAPI 3.1 facade for shared operation selection, then keeps runtime execution honest by sending SOAP envelopes to the configured service endpoint.

## Contract phase

```ts
import { convertWsdlToOpenApi } from "@quickdeployai/wsdl-2-mcp";

const result = await convertWsdlToOpenApi({
  wsdlPath: "packages/importers/wsdl-2-mcp/fixtures/calculator-document-literal.wsdl",
});
```

The conversion result includes:

- `openapi`: OpenAPI 3.1 paths and component schemas suitable for MCP tool selection.
- `operations`: SOAP action, endpoint, input/output element, and fault metadata.
- `warnings`: review gates such as `rpc-encoded-review`.

Document/literal fixtures preserve imported XSD complex types, repeated fields, SOAP actions, endpoints, and named faults. RPC/encoded WSDLs remain catalogable but carry an explicit warning and must not be published without review.

## Runtime phase

```ts
import { createSoapExecutor } from "@quickdeployai/wsdl-2-mcp";

const execute = createSoapExecutor({
  endpoint: "https://example.invalid/soap/calculator",
  soapAction: "https://quickdeploy.ai/fixtures/wsdl/calculator/Add",
  inputElement: "AddRequest",
  outputElement: "AddResponse",
});

const result = await execute({ left: 2, right: 3 });
```

SOAP faults throw `SoapFaultError` with `faultCode`, `faultString`, and parsed `detail` so MCP callers receive structured tool errors instead of raw XML.

## Registry manifest

`registry/quickdeploy/wsdl-calculator.mcp.json` publishes the calculator fixture as
`ai.quickdeploy/wsdl-calculator` through `mcp-host`. The manifest selects
`POST /soap/CalculatorService/Add`, exposes `calculator_add`, and keeps the
SOAP endpoint as runtime configuration.
