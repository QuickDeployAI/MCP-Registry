import { describe, expect, it } from "vitest";
import { AsyncApiImportError, buildKafkaPublishTools } from "./publish";
import type { KafkaProducer, KafkaPublishRequest } from "./types";

const petstoreAsyncApi = `
asyncapi: 3.0.0
info:
  title: Petstore events
  version: 1.0.0
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
          ageMonths:
            type: integer
            minimum: 0
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

describe("buildKafkaPublishTools", () => {
  it("generates a publish tool for AsyncAPI send operations and produces valid payloads", async () => {
    const producer = new RecordingProducer();
    const tools = await buildKafkaPublishTools(petstoreAsyncApi, { producer });

    expect(tools.map((tool) => tool.name)).toEqual(["publish_pet_created"]);
    expect(tools[0]?.inputSchema).toMatchObject({
      required: ["petId", "species", "name"],
      properties: {
        petId: { type: "string" },
        key: { type: "string" },
      },
    });

    const result = await tools[0]?.publish({
      petId: "pet-123",
      species: "cat",
      name: "Miso",
      ageMonths: 8,
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
              ageMonths: 8,
            }),
          },
        ],
      },
    ]);
    expect(result).toMatchObject({
      structuredContent: {
        accepted: true,
        messageName: "pet.created",
        broker: "kafka",
        topic: "petstore.pets.v1",
      },
      _meta: {
        partition: 4,
        offset: "9182",
        messageId: "petstore.pets.v1/4/9182",
      },
    });
  });

  it("rejects invalid payloads before producing to Kafka", async () => {
    const producer = new RecordingProducer();
    const [tool] = await buildKafkaPublishTools(petstoreAsyncApi, { producer });

    await expect(tool?.publish({ species: "cat", name: "Miso" })).rejects.toThrow(
      AsyncApiImportError,
    );
    expect(producer.requests).toEqual([]);
  });

  it("honors x-kafka-key when no explicit key is provided", async () => {
    const producer = new RecordingProducer();
    const [tool] = await buildKafkaPublishTools(
      {
        asyncapi: "3.0.0",
        info: { title: "Orders", version: "1.0.0" },
        channels: {
          orders: {
            address: "orders.created",
            messages: {
              orderCreated: {
                name: "order.created",
                "x-kafka-key": "orderId",
                payload: {
                  type: "object",
                  required: ["orderId"],
                  properties: { orderId: { type: "string" } },
                },
              },
            },
          },
        },
        operations: {
          publishOrderCreated: {
            action: "send",
            channel: { $ref: "#/channels/orders" },
          },
        },
      },
      { producer },
    );

    await tool?.publish({ orderId: "order-1" });

    expect(producer.requests[0]?.messages[0]?.key).toBe("order-1");
    expect(producer.requests[0]?.topic).toBe("orders.created");
  });
});

class RecordingProducer implements KafkaProducer {
  readonly requests: KafkaPublishRequest[] = [];

  async send(request: KafkaPublishRequest) {
    this.requests.push(request);
    return [{ topicName: request.topic, partition: 4, baseOffset: "9182" }];
  }
}
