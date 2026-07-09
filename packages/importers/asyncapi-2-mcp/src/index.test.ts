import { describe, expect, it } from "vitest";
import {
  ASYNCAPI_MEDIA_TYPE,
  asyncApiToParsedCapabilities,
  createAsyncApiArtifactParser,
  parseAsyncApiDocument,
} from "./index";
import type { KafkaProducer, KafkaPublishRequest } from "./types";

const petstoreAsyncApi = `
asyncapi: 3.0.0
info:
  title: Petstore events
  version: 1.0.0
  description: Pet lifecycle event contract.
channels:
  petEvents:
    address: petstore.pets.v1
    messages:
      petCreated:
        $ref: "#/components/messages/petCreated"
      petAdopted:
        $ref: "#/components/messages/petAdopted"
    bindings:
      kafka:
        topic: petstore.pets.v1
operations:
  publishPetCreated:
    action: send
    channel:
      $ref: "#/channels/petEvents"
    messages:
      - $ref: "#/channels/petEvents/messages/petCreated"
  consumePetEvents:
    action: receive
    channel:
      $ref: "#/channels/petEvents"
components:
  messages:
    petCreated:
      name: pet.created
      payload:
        type: object
        required: [petId, species, name]
        properties:
          petId:
            type: string
          species:
            type: string
          name:
            type: string
    petAdopted:
      name: pet.adopted
      payload:
        type: object
        required: [petId, adopterId]
        properties:
          petId:
            type: string
          adopterId:
            type: string
`;

describe("AsyncAPI artifact parser", () => {
  it("emits api-contract, event, and tool capabilities", async () => {
    const document = await parseAsyncApiDocument(petstoreAsyncApi);
    const capabilities = asyncApiToParsedCapabilities(document);

    expect(capabilities.map((capability) => [capability.kind, capability.name])).toEqual([
      ["api-contract", "Petstore events"],
      ["event", "pet.created"],
      ["event", "pet.adopted"],
      ["tool", "publish_pet_created"],
    ]);
    expect(
      capabilities.find((capability) => capability.kind === "tool")?.inputSchema,
    ).toMatchObject({
      required: ["petId", "species", "name"],
      properties: {
        petId: { type: "string" },
        key: { type: "string" },
      },
    });
  });

  it("builds an ArtifactParser-compatible MCP projection with invokable publish tools", async () => {
    const producer = new RecordingProducer();
    const parser = createAsyncApiArtifactParser({ producer });
    const result = await parser.parse(petstoreAsyncApi, {
      identifier: "urn:air:example.test:api:petstore-events",
      displayName: "Petstore events",
      type: ASYNCAPI_MEDIA_TYPE,
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.mcpProjection?.tools.map((tool) => tool.name)).toEqual(["publish_pet_created"]);

    const publishResult = await result.mcpProjection?.tools[0]?.publish({
      petId: "pet-123",
      species: "cat",
      name: "Miso",
    });

    expect(producer.requests).toEqual([
      {
        topic: "petstore.pets.v1",
        messages: [
          {
            key: "pet-123",
            value: JSON.stringify({
              petId: "pet-123",
              species: "cat",
              name: "Miso",
            }),
          },
        ],
      },
    ]);
    expect(publishResult).toMatchObject({
      structuredContent: {
        accepted: true,
        messageName: "pet.created",
        broker: "kafka",
        topic: "petstore.pets.v1",
      },
    });
  });

  it("omits MCP projection and reports a diagnostic without broker runtime", async () => {
    const result = await createAsyncApiArtifactParser().parse(petstoreAsyncApi, {
      identifier: "urn:air:example.test:api:petstore-events",
      displayName: "Petstore events",
      type: ASYNCAPI_MEDIA_TYPE,
    });

    expect(result.mcpProjection).toBeUndefined();
    expect(result.diagnostics).toEqual([
      {
        level: "info",
        message: "AsyncAPI document parsed without broker runtime; MCP projection omitted.",
      },
    ]);
  });
});

class RecordingProducer implements KafkaProducer {
  readonly requests: KafkaPublishRequest[] = [];

  async send(request: KafkaPublishRequest) {
    this.requests.push(request);
    return [{ topicName: request.topic, partition: 0, baseOffset: "42" }];
  }
}
