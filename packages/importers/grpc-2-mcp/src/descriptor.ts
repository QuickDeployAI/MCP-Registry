import { fromBinary } from "@bufbuild/protobuf";
import {
  type FileDescriptorProto,
  type MethodDescriptorProto,
  FileDescriptorSetSchema,
} from "@bufbuild/protobuf/wkt";
import { protobufMessageToJsonSchema, type JsonSchema } from "./schema";

export type GrpcMethodShape = {
  serviceName: string;
  methodName: string;
  fullName: string;
  inputType: string;
  outputType: string;
  clientStreaming: boolean;
  serverStreaming: boolean;
  mcpExposure: "tool" | "server-stream-tool" | "unsupported-stream";
  description?: string;
  inputSchema?: JsonSchema;
  outputSchema?: JsonSchema;
};

export type UnsupportedGrpcMethod = GrpcMethodShape & {
  mcpExposure: "unsupported-stream";
  reason: string;
};

export type GrpcServiceShape = {
  fileName: string;
  packageName: string;
  serviceName: string;
  fullName: string;
  description?: string;
  methods: GrpcMethodShape[];
};

export function parseFileDescriptorSet(bytes: Uint8Array): GrpcServiceShape[] {
  const descriptorSet = fromBinary(FileDescriptorSetSchema, bytes);
  return descriptorSet.file.flatMap((file) => servicesFromFile(file, descriptorSet.file));
}

export function unaryToolsFromDescriptors(bytes: Uint8Array): GrpcMethodShape[] {
  return parseFileDescriptorSet(bytes).flatMap((service) =>
    service.methods.filter((method) => method.mcpExposure === "tool"),
  );
}

export function serverStreamToolsFromDescriptors(bytes: Uint8Array): GrpcMethodShape[] {
  return parseFileDescriptorSet(bytes).flatMap((service) =>
    service.methods.filter((method) => method.mcpExposure === "server-stream-tool"),
  );
}

function servicesFromFile(
  file: FileDescriptorProto,
  files: readonly FileDescriptorProto[],
): GrpcServiceShape[] {
  return file.service.map((service, serviceIndex) => {
    const packagePrefix = file.package ? `${file.package}.` : "";
    const fullName = `${packagePrefix}${service.name}`;
    return {
      fileName: file.name,
      packageName: file.package,
      serviceName: service.name,
      fullName,
      description: sourceComment(file, [6, serviceIndex]),
      methods: service.method.map((method, methodIndex) =>
        methodShape(
          fullName,
          method,
          sourceComment(file, [6, serviceIndex, 2, methodIndex]),
          files,
        ),
      ),
    };
  });
}

function methodShape(
  serviceName: string,
  method: MethodDescriptorProto,
  description: string | undefined,
  files: readonly FileDescriptorProto[],
): GrpcMethodShape {
  const isUnary = !method.clientStreaming && !method.serverStreaming;
  const isServerStreamOnly = !method.clientStreaming && method.serverStreaming;
  const isExposable = isUnary || isServerStreamOnly;
  return {
    serviceName,
    methodName: method.name,
    fullName: `${serviceName}/${method.name}`,
    inputType: method.inputType,
    outputType: method.outputType,
    clientStreaming: method.clientStreaming,
    serverStreaming: method.serverStreaming,
    mcpExposure: isUnary
      ? "tool"
      : isServerStreamOnly
        ? "server-stream-tool"
        : "unsupported-stream",
    description,
    inputSchema: isExposable ? protobufMessageToJsonSchema(files, method.inputType) : undefined,
    outputSchema: isExposable ? protobufMessageToJsonSchema(files, method.outputType) : undefined,
  };
}

function sourceComment(file: FileDescriptorProto, path: number[]): string | undefined {
  const location = file.sourceCodeInfo?.location.find((candidate) =>
    samePath(candidate.path, path),
  );
  const comment = location?.leadingComments?.trim() || location?.trailingComments?.trim();
  return comment || undefined;
}

function samePath(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
