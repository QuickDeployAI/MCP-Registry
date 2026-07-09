import { describe, expect, it, vi } from "vitest";
import { parseFileDescriptorSet, unaryToolsFromDescriptors } from "./descriptor";
import { buildGrpcUnaryTools } from "./tools";
import { greeterDescriptorBytes } from "./test-fixtures";

describe("FileDescriptorSet parsing", () => {
  const descriptorBytes = greeterDescriptorBytes();

  it("keeps service, unary method, and source-comment metadata", () => {
    const [service] = parseFileDescriptorSet(descriptorBytes);
    expect(service).toMatchObject({
      fileName: "greeter.proto",
      packageName: "quickdeploy.fixture",
      serviceName: "Greeter",
      fullName: "quickdeploy.fixture.Greeter",
      description: "Greeter service used by the runtime fixture.",
    });
    expect(service?.methods[0]).toMatchObject({
      fullName: "quickdeploy.fixture.Greeter/SayHello",
      mcpExposure: "tool",
      description: "Unary hello method exposed as an MCP tool.",
    });
  });

  it("exposes only unary methods as MCP tools and reports fully-unsupported streaming methods", () => {
    const tools = unaryToolsFromDescriptors(descriptorBytes);
    expect(tools.map((tool) => tool.methodName)).toEqual(["SayHello", "DescribeProfile"]);

    const warn = vi.fn();
    const catalog = buildGrpcUnaryTools(descriptorBytes, {
      runtime: {
        protoPath: "unused.proto",
        packageName: "quickdeploy.fixture",
        address: "127.0.0.1:1",
      },
      logger: { warn },
    });

    expect(catalog.unsupportedMethods.map((method) => method.methodName)).toEqual([
      "UploadHellos",
      "ChatHello",
    ]);
    expect(catalog.unsupportedMethods[0]).toMatchObject({
      methodName: "UploadHellos",
      reason:
        "quickdeploy.fixture.Greeter/UploadHellos uses client streaming; grpc-2-mcp MVP exposes unary RPCs only.",
    });
    expect(catalog.unsupportedMethods[1]).toMatchObject({
      methodName: "ChatHello",
      reason:
        "quickdeploy.fixture.Greeter/ChatHello uses bidirectional streaming; grpc-2-mcp MVP exposes unary RPCs only.",
    });
    expect(warn).toHaveBeenCalledWith(catalog.unsupportedMethods[0]?.reason);
    expect(warn).toHaveBeenCalledWith(catalog.unsupportedMethods[1]?.reason);
  });

  it("exposes server-streaming methods as bounded progress-notification tools", () => {
    const catalog = buildGrpcUnaryTools(descriptorBytes, {
      runtime: {
        protoPath: "unused.proto",
        packageName: "quickdeploy.fixture",
        address: "127.0.0.1:1",
      },
    });

    expect(catalog.streamingTools.map((tool) => tool.methodName)).toEqual(["WatchHello"]);
    expect(catalog.streamingTools[0]).toMatchObject({
      name: "quickdeploy_fixture_greeter_watch_hello",
      serviceName: "Greeter",
      description: "Server streaming is exposed as a bounded progress-notification tool.",
    });
    expect(catalog.streamingTools[0]?.inputSchema).toMatchObject({
      type: "object",
      properties: { name: { type: "string" } },
    });
  });

  it("maps proto3 JSON edge cases into request schemas", () => {
    const profileTool = unaryToolsFromDescriptors(descriptorBytes).find(
      (tool) => tool.methodName === "DescribeProfile",
    );

    expect(profileTool?.inputSchema).toMatchObject({
      type: "object",
      properties: {
        userId: { type: "string" },
        accountId: { type: "string", pattern: "^-?[0-9]+$", "x-protobuf-type": "int64" },
        tags: { type: "array", items: { type: "string" } },
        metadata: { type: "object", additionalProperties: { type: "string" } },
        attributes: {
          type: "object",
          additionalProperties: true,
          "x-protobuf-type": "google.protobuf.Struct",
        },
        email: { type: "string", "x-protobuf-oneof": "contact" },
        phone: { type: "string", "x-protobuf-oneof": "contact" },
      },
    });
  });
});
