import type {
  DescriptorProto,
  FieldDescriptorProto,
  FileDescriptorProto,
} from "@bufbuild/protobuf/wkt";

export type JsonSchema = {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  additionalProperties?: boolean | JsonSchema;
  enum?: string[];
  oneOf?: JsonSchema[];
  pattern?: string;
  contentEncoding?: string;
  description?: string;
  $ref?: string;
  "x-protobuf-type"?: string;
  "x-protobuf-oneof"?: string;
};

type DescriptorIndex = {
  messages: Map<string, DescriptorProto>;
  enums: Map<string, string[]>;
};

const LABEL_REPEATED = 3;
const TYPE_DOUBLE = 1;
const TYPE_FLOAT = 2;
const TYPE_INT64 = 3;
const TYPE_UINT64 = 4;
const TYPE_INT32 = 5;
const TYPE_FIXED64 = 6;
const TYPE_FIXED32 = 7;
const TYPE_BOOL = 8;
const TYPE_STRING = 9;
const TYPE_MESSAGE = 11;
const TYPE_BYTES = 12;
const TYPE_UINT32 = 13;
const TYPE_ENUM = 14;
const TYPE_SFIXED32 = 15;
const TYPE_SFIXED64 = 16;
const TYPE_SINT32 = 17;
const TYPE_SINT64 = 18;

const WELL_KNOWN_SCHEMAS: Record<string, JsonSchema> = {
  ".google.protobuf.Struct": {
    type: "object",
    additionalProperties: true,
    "x-protobuf-type": "google.protobuf.Struct",
  },
  ".google.protobuf.Value": {
    oneOf: [
      { type: "null" },
      { type: "number" },
      { type: "string" },
      { type: "boolean" },
      { type: "object", additionalProperties: true },
      { type: "array", items: {} },
    ],
    "x-protobuf-type": "google.protobuf.Value",
  },
  ".google.protobuf.ListValue": {
    type: "array",
    items: { $ref: "google.protobuf.Value" },
    "x-protobuf-type": "google.protobuf.ListValue",
  },
  ".google.protobuf.Any": {
    type: "object",
    required: ["@type"],
    properties: {
      "@type": { type: "string" },
    },
    additionalProperties: true,
    "x-protobuf-type": "google.protobuf.Any",
  },
};

export function protobufMessageToJsonSchema(
  files: readonly FileDescriptorProto[],
  typeName: string,
  options: { maxDepth?: number } = {},
): JsonSchema {
  const index = buildIndex(files);
  return schemaForMessage(index, normalizeTypeName(typeName), options.maxDepth ?? 4, []);
}

function buildIndex(files: readonly FileDescriptorProto[]): DescriptorIndex {
  const messages = new Map<string, DescriptorProto>();
  const enums = new Map<string, string[]>();
  for (const file of files) {
    const packagePrefix = file.package ? `.${file.package}` : "";
    for (const message of file.messageType) {
      indexMessage(messages, enums, `${packagePrefix}.${message.name}`, message);
    }
    for (const enumType of file.enumType) {
      enums.set(
        `${packagePrefix}.${enumType.name}`,
        enumType.value.map((value) => value.name),
      );
    }
  }
  return { messages, enums };
}

function indexMessage(
  messages: Map<string, DescriptorProto>,
  enums: Map<string, string[]>,
  fullName: string,
  message: DescriptorProto,
): void {
  messages.set(fullName, message);
  for (const nested of message.nestedType) {
    indexMessage(messages, enums, `${fullName}.${nested.name}`, nested);
  }
  for (const enumType of message.enumType) {
    enums.set(
      `${fullName}.${enumType.name}`,
      enumType.value.map((value) => value.name),
    );
  }
}

function schemaForMessage(
  index: DescriptorIndex,
  typeName: string,
  depth: number,
  stack: string[],
): JsonSchema {
  const wellKnown = WELL_KNOWN_SCHEMAS[typeName];
  if (wellKnown) {
    return { ...wellKnown };
  }
  if (depth <= 0 || stack.includes(typeName)) {
    return { type: "object", additionalProperties: true, $ref: typeName };
  }
  const message = index.messages.get(typeName);
  if (!message) {
    return { type: "object", additionalProperties: true, $ref: typeName };
  }

  const properties: Record<string, JsonSchema> = {};
  for (const field of message.field) {
    properties[jsonFieldName(field)] = schemaForField(index, message, field, depth, [
      ...stack,
      typeName,
    ]);
  }

  return {
    type: "object",
    properties,
    additionalProperties: false,
  };
}

function schemaForField(
  index: DescriptorIndex,
  owner: DescriptorProto,
  field: FieldDescriptorProto,
  depth: number,
  stack: string[],
): JsonSchema {
  const mapEntry = mapEntryMessage(index, owner, field);
  if (mapEntry) {
    const valueField = mapEntry.field.find((candidate) => candidate.number === 2);
    return {
      type: "object",
      additionalProperties: valueField
        ? scalarOrMessageSchema(index, valueField, depth - 1, stack)
        : true,
    };
  }

  const schema = scalarOrMessageSchema(index, field, depth - 1, stack);
  const withOneof = annotateOneof(owner, field, schema);

  if (field.label === LABEL_REPEATED) {
    return {
      type: "array",
      items: withOneof,
    };
  }

  return withOneof;
}

function scalarOrMessageSchema(
  index: DescriptorIndex,
  field: FieldDescriptorProto,
  depth: number,
  stack: string[],
): JsonSchema {
  switch (field.type) {
    case TYPE_DOUBLE:
    case TYPE_FLOAT:
      return { type: "number" };
    case TYPE_INT32:
    case TYPE_FIXED32:
    case TYPE_UINT32:
    case TYPE_SFIXED32:
    case TYPE_SINT32:
      return { type: "integer" };
    case TYPE_INT64:
    case TYPE_UINT64:
    case TYPE_FIXED64:
    case TYPE_SFIXED64:
    case TYPE_SINT64:
      return { type: "string", pattern: "^-?[0-9]+$", "x-protobuf-type": "int64" };
    case TYPE_BOOL:
      return { type: "boolean" };
    case TYPE_STRING:
      return { type: "string" };
    case TYPE_BYTES:
      return { type: "string", contentEncoding: "base64" };
    case TYPE_ENUM:
      return { type: "string", enum: index.enums.get(normalizeTypeName(field.typeName)) };
    case TYPE_MESSAGE:
      return schemaForMessage(index, normalizeTypeName(field.typeName), depth, stack);
    default:
      return {};
  }
}

function mapEntryMessage(
  index: DescriptorIndex,
  owner: DescriptorProto,
  field: FieldDescriptorProto,
): DescriptorProto | undefined {
  if (field.label !== LABEL_REPEATED || field.type !== TYPE_MESSAGE) {
    return undefined;
  }
  const message = index.messages.get(normalizeTypeName(field.typeName));
  if (!message?.options?.mapEntry) {
    return undefined;
  }
  if (!owner.nestedType.some((nested) => nested.name === message.name)) {
    return undefined;
  }
  return message;
}

function annotateOneof(
  owner: DescriptorProto,
  field: FieldDescriptorProto,
  schema: JsonSchema,
): JsonSchema {
  if (field.oneofIndex === undefined || field.oneofIndex < 0) {
    return schema;
  }
  const oneofName = owner.oneofDecl[field.oneofIndex]?.name;
  if (!oneofName) {
    return schema;
  }
  return { ...schema, "x-protobuf-oneof": oneofName };
}

function jsonFieldName(field: FieldDescriptorProto): string {
  return field.jsonName || lowerCamel(field.name);
}

function lowerCamel(value: string): string {
  return value.replace(/_([a-z0-9])/g, (_, char: string) => char.toUpperCase());
}

function normalizeTypeName(typeName: string): string {
  return typeName.startsWith(".") ? typeName : `.${typeName}`;
}
