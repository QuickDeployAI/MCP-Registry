# wsdl-2-mcp fixtures

These fixtures are the QUI-206 corpus for evaluating a WSDL-to-OpenAPI shim
before implementing `wsdl-2-mcp`.

## Fixtures

- `calculator-document-literal.wsdl` imports `calculator-types.xsd` and covers
  document/literal wrapped operations, nested XSD types, and a declared SOAP
  fault.
- `legacy-rpc-encoded.wsdl` covers rpc/encoded bindings. A converter may catalog
  this service, but the importer should mark it as lower fidelity and require
  manual review before registry publishing.
- `customer-faults-document-literal.wsdl` covers repeated/nested payloads and
  named faults that must remain visible in generated operation metadata.

## Required converter checks

Future tests for `wsdl-2-mcp` should assert that conversion preserves operation
names, SOAP actions, endpoint addresses, imported schema types, fault names, and
review warnings. The tests should also assert that no generated OpenAPI document
contains concrete secret values.
