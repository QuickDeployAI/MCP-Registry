import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { XMLBuilder, XMLParser } from "fast-xml-parser";

export type JsonSchema = {
  type?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: string[];
  $ref?: string;
  additionalProperties?: boolean;
};

export type WsdlWarning = {
  code: string;
  operation?: string;
  message: string;
};

export type WsdlOperation = {
  name: string;
  toolName: string;
  endpoint: string;
  soapAction: string;
  inputElement: string;
  outputElement: string;
  bindingStyle: "document" | "rpc";
  bodyUse: "literal" | "encoded";
  compatibility: "document-literal" | "rpc-encoded";
  faults: WsdlFault[];
};

export type WsdlFault = {
  name: string;
  message: string;
  element: string;
};

export type OpenApiDocument = {
  openapi: "3.1.0";
  info: { title: string; version: string };
  servers: { url: string }[];
  paths: Record<string, Record<string, OpenApiOperation>>;
  components: { schemas: Record<string, JsonSchema> };
};

type OpenApiOperation = {
  operationId: string;
  summary: string;
  requestBody: {
    required: true;
    content: Record<string, { schema: JsonSchema }>;
  };
  responses: Record<
    string,
    { description: string; content?: Record<string, { schema: JsonSchema }> }
  >;
  "x-quickdeploy-soap": {
    action: string;
    bindingStyle: "document" | "rpc";
    bodyUse: "literal" | "encoded";
    endpoint: string;
    compatibility: "document-literal" | "rpc-encoded";
    faults: WsdlFault[];
  };
};

export type WsdlConversionResult = {
  openapi: OpenApiDocument;
  operations: WsdlOperation[];
  warnings: WsdlWarning[];
};

type ConvertOptions = {
  wsdlPath: string;
};

type XmlRecord = Record<string, unknown>;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  parseTagValue: false,
  trimValues: true,
});

const builder = new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  format: false,
});

export async function convertWsdlToOpenApi(options: ConvertOptions): Promise<WsdlConversionResult> {
  const wsdlPath = resolve(options.wsdlPath);
  const document = asRecord(parser.parse(await readFile(wsdlPath, "utf8")));
  const definitions = asRecord(document.definitions);
  const serviceName = stringValue(definitions["@_name"], "WsdlService");
  const targetNamespace = stringValue(definitions["@_targetNamespace"], "");

  const schemaIndex = await loadSchemas(definitions, wsdlPath);
  const messages = readMessages(definitions);
  const portOperations = readPortTypeOperations(definitions);
  const binding = readBinding(definitions);
  const endpoint = readEndpoint(definitions);
  const schemas = schemaIndexToOpenApiSchemas(schemaIndex);
  const operations: WsdlOperation[] = [];
  const warnings: WsdlWarning[] = [];
  const paths: OpenApiDocument["paths"] = {};

  for (const bindingOperation of binding.operations) {
    const portOperation = portOperations.get(bindingOperation.name);
    if (!portOperation) continue;

    const inputMessage = messages.get(portOperation.inputMessage);
    const outputMessage = messages.get(portOperation.outputMessage);
    if (!inputMessage || !outputMessage) continue;

    const inputElement = inputMessage.element ?? `${bindingOperation.name}Request`;
    const outputElement = outputMessage.element ?? `${bindingOperation.name}Response`;
    const compatibility =
      binding.style === "rpc" || bindingOperation.bodyUse === "encoded"
        ? "rpc-encoded"
        : "document-literal";
    const operation: WsdlOperation = {
      name: bindingOperation.name,
      toolName: `${servicePrefix(serviceName)}_${operationSuffix(bindingOperation.name)}`,
      endpoint,
      soapAction: bindingOperation.soapAction,
      inputElement,
      outputElement,
      bindingStyle: binding.style,
      bodyUse: bindingOperation.bodyUse,
      compatibility,
      faults: portOperation.faults
        .map((fault) => {
          const message = messages.get(fault.message);
          return message?.element
            ? {
                name: fault.name,
                message: fault.message,
                element: message.element,
              }
            : undefined;
        })
        .filter((fault): fault is WsdlFault => Boolean(fault)),
    };
    operations.push(operation);

    if (compatibility === "rpc-encoded") {
      warnings.push({
        code: "rpc-encoded-review",
        operation: operation.name,
        message: `${operation.name} uses rpc/encoded SOAP; keep it catalogable but require manual review before publishing.`,
      });
    }

    paths[`/soap/${serviceName}/${bindingOperation.name}`] = {
      post: openApiOperation(operation, schemas),
    };
  }

  return {
    operations,
    warnings,
    openapi: {
      openapi: "3.1.0",
      info: {
        title: serviceName,
        version: "0.1.0",
      },
      servers: endpoint ? [{ url: endpoint }] : [],
      paths,
      components: { schemas },
    },
  };
}

function openApiOperation(
  operation: WsdlOperation,
  schemas: Record<string, JsonSchema>,
): OpenApiOperation {
  const inputSchema = schemaRefOrObject(operation.inputElement, schemas);
  const outputSchema = schemaRefOrObject(operation.outputElement, schemas);
  const responses: OpenApiOperation["responses"] = {
    "200": {
      description: `${operation.name} SOAP response.`,
      content: {
        "application/json": { schema: outputSchema },
      },
    },
  };

  for (const fault of operation.faults) {
    responses[fault.name] = {
      description: `${fault.name} SOAP fault.`,
      content: {
        "application/json": { schema: schemaRefOrObject(fault.element, schemas) },
      },
    };
  }

  return {
    operationId: operation.toolName,
    summary: `${operation.name} SOAP operation exposed through wsdl-2-mcp.`,
    requestBody: {
      required: true,
      content: {
        "application/json": { schema: inputSchema },
      },
    },
    responses,
    "x-quickdeploy-soap": {
      action: operation.soapAction,
      bindingStyle: operation.bindingStyle,
      bodyUse: operation.bodyUse,
      endpoint: operation.endpoint,
      compatibility: operation.compatibility,
      faults: operation.faults,
    },
  };
}

function schemaRefOrObject(name: string, schemas: Record<string, JsonSchema>): JsonSchema {
  return schemas[name] ? { $ref: `#/components/schemas/${name}` } : { type: "object" };
}

type MessageShape = {
  element?: string;
  parts: { name: string; type?: string }[];
};

function readMessages(definitions: XmlRecord): Map<string, MessageShape> {
  const messages = new Map<string, MessageShape>();
  for (const message of arrayOf(definitions.message).map(asRecord)) {
    const name = stringValue(message["@_name"], "");
    const parts = arrayOf(message.part).map(asRecord);
    const firstPart = parts[0];
    messages.set(name, {
      element: firstPart ? localName(stringValue(firstPart["@_element"], "")) : undefined,
      parts: parts.map((part) => ({
        name: stringValue(part["@_name"], ""),
        type: localName(stringValue(part["@_type"], "")),
      })),
    });
  }
  return messages;
}

type PortOperation = {
  inputMessage: string;
  outputMessage: string;
  faults: { name: string; message: string }[];
};

function readPortTypeOperations(definitions: XmlRecord): Map<string, PortOperation> {
  const operations = new Map<string, PortOperation>();
  for (const portType of arrayOf(definitions.portType).map(asRecord)) {
    for (const operation of arrayOf(portType.operation).map(asRecord)) {
      const name = stringValue(operation["@_name"], "");
      operations.set(name, {
        inputMessage: localName(stringValue(asRecord(operation.input)["@_message"], "")),
        outputMessage: localName(stringValue(asRecord(operation.output)["@_message"], "")),
        faults: arrayOf(operation.fault)
          .map(asRecord)
          .map((fault) => ({
            name: stringValue(fault["@_name"], ""),
            message: localName(stringValue(fault["@_message"], "")),
          })),
      });
    }
  }
  return operations;
}

type BindingShape = {
  style: "document" | "rpc";
  operations: {
    name: string;
    soapAction: string;
    bodyUse: "literal" | "encoded";
  }[];
};

function readBinding(definitions: XmlRecord): BindingShape {
  const binding = asRecord(arrayOf(definitions.binding)[0]);
  const soapBinding = asRecord(binding.binding);
  const style = soapBinding["@_style"] === "rpc" ? "rpc" : "document";
  return {
    style,
    operations: arrayOf(binding.operation)
      .map(asRecord)
      .map((operation) => {
        const inputBody = asRecord(asRecord(operation.input).body);
        return {
          name: stringValue(operation["@_name"], ""),
          soapAction: stringValue(asRecord(operation.operation)["@_soapAction"], ""),
          bodyUse: inputBody["@_use"] === "encoded" ? "encoded" : "literal",
        };
      }),
  };
}

function readEndpoint(definitions: XmlRecord): string {
  for (const service of arrayOf(definitions.service).map(asRecord)) {
    for (const port of arrayOf(service.port).map(asRecord)) {
      const address = asRecord(port.address);
      const location = stringValue(address["@_location"], "");
      if (location) return location;
    }
  }
  return "";
}

type SchemaIndex = {
  elements: Map<string, string>;
  complexTypes: Map<string, JsonSchema>;
  simpleTypes: Map<string, JsonSchema>;
};

async function loadSchemas(definitions: XmlRecord, wsdlPath: string): Promise<SchemaIndex> {
  const index: SchemaIndex = {
    elements: new Map(),
    complexTypes: new Map(),
    simpleTypes: new Map(),
  };
  const schemas = arrayOf(asRecord(definitions.types).schema).map(asRecord);
  for (const schema of schemas) {
    readSchemaIntoIndex(schema, index);
    for (const imported of arrayOf(schema.import).map(asRecord)) {
      const schemaLocation = stringValue(imported["@_schemaLocation"], "");
      if (!schemaLocation) continue;
      const importedPath = resolve(dirname(wsdlPath), schemaLocation);
      const document = asRecord(parser.parse(await readFile(importedPath, "utf8")));
      readSchemaIntoIndex(asRecord(document.schema), index);
    }
  }
  return index;
}

function readSchemaIntoIndex(schema: XmlRecord, index: SchemaIndex): void {
  for (const simpleType of arrayOf(schema.simpleType).map(asRecord)) {
    const name = stringValue(simpleType["@_name"], "");
    const restriction = asRecord(simpleType.restriction);
    const enumValues = arrayOf(restriction.enumeration)
      .map(asRecord)
      .map((entry) => stringValue(entry["@_value"], ""))
      .filter(Boolean);
    index.simpleTypes.set(name, {
      type: xmlSchemaTypeToJsonType(localName(stringValue(restriction["@_base"], "string"))),
      ...(enumValues.length > 0 ? { enum: enumValues } : {}),
    });
  }

  for (const complexType of arrayOf(schema.complexType).map(asRecord)) {
    const name = stringValue(complexType["@_name"], "");
    index.complexTypes.set(name, complexTypeToJsonSchema(complexType, index));
  }

  for (const element of arrayOf(schema.element).map(asRecord)) {
    const name = stringValue(element["@_name"], "");
    const type = localName(stringValue(element["@_type"], name));
    index.elements.set(name, type);
  }
}

function schemaIndexToOpenApiSchemas(index: SchemaIndex): Record<string, JsonSchema> {
  const schemas: Record<string, JsonSchema> = {};
  for (const [name, schema] of index.simpleTypes) {
    schemas[name] = schema;
  }
  for (const [name, schema] of index.complexTypes) {
    schemas[name] = schema;
  }
  for (const [elementName, typeName] of index.elements) {
    schemas[elementName] =
      index.complexTypes.get(typeName) ?? index.simpleTypes.get(typeName) ?? {};
  }
  return schemas;
}

function complexTypeToJsonSchema(complexType: XmlRecord, index: SchemaIndex): JsonSchema {
  const sequence = asRecord(complexType.sequence);
  const properties: Record<string, JsonSchema> = {};
  const required: string[] = [];

  for (const element of arrayOf(sequence.element).map(asRecord)) {
    const name = stringValue(element["@_name"], "");
    const typeName = localName(stringValue(element["@_type"], "string"));
    const schema = typeToJsonSchema(typeName, index);
    const isArray = stringValue(element["@_maxOccurs"], "1") === "unbounded";
    properties[name] = isArray ? { type: "array", items: schema } : schema;
    if (stringValue(element["@_minOccurs"], "1") !== "0") required.push(name);
  }

  return {
    type: "object",
    properties,
    ...(required.length > 0 ? { required } : {}),
    additionalProperties: false,
  };
}

function typeToJsonSchema(typeName: string, index: SchemaIndex): JsonSchema {
  if (index.simpleTypes.has(typeName)) return index.simpleTypes.get(typeName) ?? {};
  if (index.complexTypes.has(typeName)) return { $ref: `#/components/schemas/${typeName}` };
  if (!isXmlSchemaPrimitive(typeName)) return { $ref: `#/components/schemas/${typeName}` };
  return { type: xmlSchemaTypeToJsonType(typeName) };
}

function xmlSchemaTypeToJsonType(typeName: string): string {
  switch (typeName) {
    case "byte":
    case "decimal":
    case "double":
    case "float":
    case "int":
    case "integer":
    case "long":
    case "negativeInteger":
    case "nonNegativeInteger":
    case "nonPositiveInteger":
    case "positiveInteger":
    case "short":
    case "unsignedByte":
    case "unsignedInt":
    case "unsignedLong":
    case "unsignedShort":
      return Number.isInteger(0) &&
        typeName !== "decimal" &&
        typeName !== "double" &&
        typeName !== "float"
        ? "integer"
        : "number";
    case "boolean":
      return "boolean";
    default:
      return "string";
  }
}

function isXmlSchemaPrimitive(typeName: string): boolean {
  return new Set([
    "base64Binary",
    "boolean",
    "byte",
    "date",
    "dateTime",
    "decimal",
    "double",
    "float",
    "int",
    "integer",
    "long",
    "negativeInteger",
    "nonNegativeInteger",
    "nonPositiveInteger",
    "positiveInteger",
    "short",
    "string",
    "time",
    "unsignedByte",
    "unsignedInt",
    "unsignedLong",
    "unsignedShort",
  ]).has(typeName);
}

export type SoapExecutorOptions = {
  endpoint: string;
  soapAction: string;
  inputElement: string;
  outputElement: string;
  fetch?: typeof fetch;
};

export type SoapExecutor = (input: Record<string, unknown>) => Promise<unknown>;

export class SoapFaultError extends Error {
  readonly faultCode: string;
  readonly faultString: string;
  readonly detail: unknown;

  constructor(faultCode: string, faultString: string, detail: unknown) {
    super(faultString);
    this.name = "SoapFaultError";
    this.faultCode = faultCode;
    this.faultString = faultString;
    this.detail = detail;
  }
}

export function createSoapExecutor(options: SoapExecutorOptions): SoapExecutor {
  const fetchImpl = options.fetch ?? fetch;
  return async (input) => {
    const envelope = buildSoapEnvelope(options.inputElement, input);
    const response = await fetchImpl(options.endpoint, {
      method: "POST",
      headers: {
        "content-type": "text/xml; charset=utf-8",
        soapaction: `"${options.soapAction}"`,
      },
      body: envelope,
    });
    const responseText = await response.text();
    return parseSoapResponse(responseText, options.outputElement);
  };
}

function buildSoapEnvelope(inputElement: string, input: Record<string, unknown>): string {
  return builder.build({
    "soap:Envelope": {
      "@_xmlns:soap": "http://schemas.xmlsoap.org/soap/envelope/",
      "soap:Body": {
        [inputElement]: input,
      },
    },
  });
}

function parseSoapResponse(xml: string, outputElement: string): unknown {
  const document = asRecord(parser.parse(xml));
  const envelope = findFirstRecord(document, "Envelope") ?? document;
  const body = findFirstRecord(envelope, "Body") ?? envelope;
  const fault = findFirstRecord(body, "Fault");
  if (fault) {
    throw new SoapFaultError(
      stringValue(fault.faultcode, "SOAP_FAULT"),
      stringValue(fault.faultstring, "SOAP fault"),
      normalizeXmlValue(fault.detail),
    );
  }
  return normalizeXmlValue(body[outputElement]);
}

function normalizeXmlValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeXmlValue);
  if (!isRecord(value)) return coerceScalar(value);

  const normalized: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (key.startsWith("@_")) continue;
    normalized[key] = normalizeXmlValue(child);
  }
  return normalized;
}

function coerceScalar(value: unknown): unknown {
  if (typeof value !== "string") return value;
  if (/^-?\d+$/.test(value)) return Number.parseInt(value, 10);
  if (/^-?\d+\.\d+$/.test(value)) return Number.parseFloat(value);
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
}

function findFirstRecord(record: XmlRecord, localKey: string): XmlRecord | undefined {
  for (const [key, value] of Object.entries(record)) {
    if (localName(key) === localKey && isRecord(value)) return value;
  }
  return undefined;
}

function servicePrefix(serviceName: string): string {
  return serviceName
    .replace(/Service$/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function operationSuffix(operationName: string): string {
  return operationName
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function localName(value: string): string {
  const parts = value.split(":");
  return parts[parts.length - 1] ?? value;
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function arrayOf(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  return [value];
}

function asRecord(value: unknown): XmlRecord {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is XmlRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
