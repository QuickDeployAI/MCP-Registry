import type { GeneratedMcpManifestIntent } from "../../src/codegen/manifest-generator";

export const FIXTURE_GENERATED_MCP_INTENTS: GeneratedMcpManifestIntent[] = [
  {
    provider: "Acme OpenAPI",
    family: "openapi-2-mcp",
    source: { type: "http", uri: "https://api.example.test/openapi.json" },
    sourceMetadata: { retrievedAt: "2026-07-09", sourceVersion: "2026-07-01" },
    select: { requests: [{ method: "get", uriTemplate: "/widgets/{id}" }] },
    auth: [{ type: "bearer", valueFrom: { env: "ACME_OPENAPI_TOKEN" } }],
    config: {
      schema: { type: "object", properties: { baseUrl: { type: "string" } } },
      defaults: { baseUrl: "https://api.example.test" },
    },
  },
  {
    provider: "Acme Events",
    family: "asyncapi-2-mcp",
    source: { type: "http", uri: "https://events.example.test/asyncapi.json" },
    sourceMetadata: { retrievedAt: "2026-07-09", sourceVersion: "1.2.0" },
    select: { requests: [{ method: "publish", uriTemplate: "channel://orders.created" }] },
    auth: [
      { type: "api-key", in: "header", name: "x-api-key", valueFrom: { env: "ACME_EVENTS_API_KEY" } },
    ],
    config: {
      schema: { type: "object", properties: { brokerProtocol: { type: "string" } } },
      defaults: { brokerProtocol: "kafka" },
    },
  },
  {
    provider: "Acme Greeter",
    family: "grpc-2-mcp",
    source: { type: "file", uri: "file://fixtures/acme-greeter.binpb" },
    sourceMetadata: { retrievedAt: "2026-07-09", sourceVersion: "sha256:test-descriptor" },
    select: { grpcMethods: [{ service: "acme.greeter.Greeter", method: "SayHello" }] },
    auth: [{ type: "bearer", valueFrom: { env: "ACME_GRPC_TOKEN" } }],
    config: {
      schema: {
        type: "object",
        required: ["endpoint"],
        properties: { endpoint: { type: "string" }, tls: { type: "boolean" } },
      },
      defaults: { tls: true },
    },
  },
  {
    provider: "Acme SOAP",
    family: "wsdl-2-mcp",
    source: { type: "http", uri: "https://soap.example.test/service.wsdl" },
    sourceMetadata: { retrievedAt: "2026-07-09", sourceVersion: "service-v3" },
    select: { requests: [{ method: "soap", uriTemplate: "Calculator/Add" }] },
    auth: [
      {
        type: "basic",
        usernameFrom: { env: "ACME_SOAP_USERNAME" },
        passwordFrom: { env: "ACME_SOAP_PASSWORD" },
      },
    ],
    config: {
      schema: { type: "object", properties: { endpoint: { type: "string" } } },
      defaults: { endpoint: "https://soap.example.test/service" },
    },
  },
  {
    provider: "Acme Feed",
    family: "feed-2-mcp",
    source: { type: "http", uri: "https://feeds.example.test/releases.xml" },
    sourceMetadata: { retrievedAt: "2026-07-09", sourceVersion: "rss" },
    select: { corpusGlobs: ["/releases/**"] },
    auth: [],
    config: {
      schema: {
        type: "object",
        properties: {
          refreshMinutes: { type: "number" },
          maxItems: { type: "number" },
          includeContent: { type: "boolean" },
        },
      },
      defaults: { refreshMinutes: 15, maxItems: 50, includeContent: true },
    },
  },
];
