import { create, toBinary } from "@bufbuild/protobuf";
import { FileDescriptorSetSchema } from "@bufbuild/protobuf/wkt";

export function greeterDescriptorBytes(): Uint8Array {
  return toBinary(
    FileDescriptorSetSchema,
    create(FileDescriptorSetSchema, {
      file: [
        {
          name: "greeter.proto",
          package: "quickdeploy.fixture",
          dependency: ["google/protobuf/struct.proto"],
          messageType: [
            { name: "HelloRequest", field: [{ name: "name", number: 1, type: 9 }] },
            { name: "HelloReply", field: [{ name: "message", number: 1, type: 9 }] },
            {
              name: "ProfileRequest",
              field: [
                { name: "user_id", jsonName: "userId", number: 1, type: 9 },
                { name: "account_id", jsonName: "accountId", number: 2, type: 3 },
                { name: "tags", number: 3, label: 3, type: 9 },
                {
                  name: "metadata",
                  number: 4,
                  label: 3,
                  type: 11,
                  typeName: ".quickdeploy.fixture.ProfileRequest.MetadataEntry",
                },
                {
                  name: "attributes",
                  number: 5,
                  type: 11,
                  typeName: ".google.protobuf.Struct",
                },
                { name: "email", number: 6, type: 9, oneofIndex: 0 },
                { name: "phone", number: 7, type: 9, oneofIndex: 0 },
              ],
              nestedType: [
                {
                  name: "MetadataEntry",
                  field: [
                    { name: "key", number: 1, type: 9 },
                    { name: "value", number: 2, type: 9 },
                  ],
                  options: { mapEntry: true },
                },
              ],
              oneofDecl: [{ name: "contact" }],
            },
            {
              name: "ProfileReply",
              field: [
                { name: "summary", number: 1, type: 9 },
                { name: "account_id", jsonName: "accountId", number: 2, type: 3 },
              ],
            },
          ],
          service: [
            {
              name: "Greeter",
              method: [
                {
                  name: "SayHello",
                  inputType: ".quickdeploy.fixture.HelloRequest",
                  outputType: ".quickdeploy.fixture.HelloReply",
                },
                {
                  name: "DescribeProfile",
                  inputType: ".quickdeploy.fixture.ProfileRequest",
                  outputType: ".quickdeploy.fixture.ProfileReply",
                },
                {
                  name: "WatchHello",
                  inputType: ".quickdeploy.fixture.HelloRequest",
                  outputType: ".quickdeploy.fixture.HelloReply",
                  serverStreaming: true,
                },
                {
                  name: "UploadHellos",
                  inputType: ".quickdeploy.fixture.HelloRequest",
                  outputType: ".quickdeploy.fixture.HelloReply",
                  clientStreaming: true,
                },
                {
                  name: "ChatHello",
                  inputType: ".quickdeploy.fixture.HelloRequest",
                  outputType: ".quickdeploy.fixture.HelloReply",
                  clientStreaming: true,
                  serverStreaming: true,
                },
              ],
            },
          ],
          sourceCodeInfo: {
            location: [
              { path: [6, 0], leadingComments: "Greeter service used by the runtime fixture." },
              { path: [6, 0, 2, 0], leadingComments: "Unary hello method exposed as an MCP tool." },
              {
                path: [6, 0, 2, 1],
                leadingComments: "Unary nested method used to prove proto3 JSON edge handling.",
              },
              {
                path: [6, 0, 2, 2],
                leadingComments:
                  "Server streaming is exposed as a bounded progress-notification tool.",
              },
              {
                path: [6, 0, 2, 3],
                leadingComments: "Client streaming remains unsupported.",
              },
              {
                path: [6, 0, 2, 4],
                leadingComments: "Bidirectional streaming remains unsupported.",
              },
            ],
          },
        },
      ],
    }),
  );
}
