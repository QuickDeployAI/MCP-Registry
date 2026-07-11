import type { ArtifactParser, ParsedCapability } from "@quickdeployai/importer-core/parser";
import { parseFileDescriptorSet } from "@quickdeployai/grpc-2-mcp";
import type { ArdEntry } from "@quickdeployai/registry-schemas/ard";
import { convertWsdlToOpenApi, createSoapExecutor } from "@quickdeployai/wsdl-2-mcp";

export const grpcArtifactParser: ArtifactParser<ArdEntry> = {
  mediaTypes: ["application/protobuf"],
  async parse(nativeArtifact, entry) {
    if (!(nativeArtifact instanceof Uint8Array)) {
      throw new Error("gRPC ArtifactParser expected a binary FileDescriptorSet.");
    }
    const methods = parseFileDescriptorSet(nativeArtifact).flatMap((service) => service.methods);
    const capabilities: ParsedCapability[] = methods.map((method) => ({
      kind: "tool",
      name: method.fullName,
      description: method.description,
      inputSchema: method.inputSchema,
      raw: method,
    }));
    return {
      capabilities,
      mcpProjection: {
        tools: methods.map((method) => ({
          name: method.fullName,
          description: method.description ?? `Invoke gRPC method ${method.fullName}.`,
          inputSchema: method.inputSchema ?? { type: "object", additionalProperties: true },
          call: (args: unknown) => ({
            source: entry.url ?? entry.identifier,
            service: method.serviceName,
            method: method.methodName,
            arguments: args,
          }),
        })),
      },
      diagnostics: methods
        .filter((method) => method.mcpExposure === "unsupported-stream")
        .map((method) => ({
          level: "warn" as const,
          message: `${method.fullName} uses unsupported client or bidirectional streaming.`,
        })),
    };
  },
};

export const wsdlArtifactParser: ArtifactParser<ArdEntry> = {
  mediaTypes: ["application/wsdl+xml"],
  async parse(_nativeArtifact, entry) {
    if (!entry.url?.startsWith("file://")) {
      throw new Error("WSDL ArtifactParser currently requires a file:// ARD entry URL.");
    }
    const wsdlPath = fileEntryPath(entry.url);
    const converted = await convertWsdlToOpenApi({ wsdlPath });
    const capabilities: ParsedCapability[] = converted.operations.map((operation) => {
      const path = `/soap/${converted.openapi.info.title}/${operation.name}`;
      return {
        kind: "tool",
        name: operation.toolName,
        description: `${operation.name} SOAP operation.`,
        inputSchema: converted.openapi.paths[path]?.post?.requestBody.content["application/json"]?.schema,
        raw: { method: "post", path, operation },
      };
    });
    return {
      capabilities,
      mcpProjection: {
        tools: converted.operations.map((operation) => {
          const path = `/soap/${converted.openapi.info.title}/${operation.name}`;
          return {
            name: operation.toolName,
            description: `${operation.name} SOAP operation exposed through wsdl-2-mcp.`,
            inputSchema:
              converted.openapi.paths[path]?.post?.requestBody.content["application/json"]?.schema ??
              { type: "object", additionalProperties: true },
            call: createSoapExecutor({
              endpoint: operation.endpoint,
              soapAction: operation.soapAction,
              inputElement: operation.inputElement,
              outputElement: operation.outputElement,
            }),
          };
        }),
      },
      diagnostics: converted.warnings.map((warning) => ({
        level: "warn" as const,
        message: warning.message,
      })),
    };
  },
};

function fileEntryPath(value: string): string {
  if (/^file:\/\/(localhost\/|\/)/.test(value)) return new URL(value).pathname;
  return new URL(`../../../../${value.slice("file://".length)}`, import.meta.url).pathname;
}
