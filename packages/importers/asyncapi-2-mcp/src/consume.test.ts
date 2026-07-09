import { describe, expect, it } from "vitest";
import { buildKafkaConsumeBindings } from "./consume";
import type {
  KafkaConsumedMessage,
  KafkaConsumer,
  KafkaMessageHandler,
  KafkaSubscription,
} from "./types";

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
    bindings:
      kafka:
        topic: petstore.pets.v1
operations:
  consumePetEvents:
    action: receive
    channel:
      $ref: "#/channels/petEvents"
    messages:
      - $ref: "#/channels/petEvents/messages/petCreated"
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
`;

describe("buildKafkaConsumeBindings", () => {
  it("buffers produced messages and pages them by cursor in receive order", async () => {
    const consumer = new RecordingConsumer();
    const [binding] = await buildKafkaConsumeBindings(petstoreAsyncApi, {
      consumer,
      bufferSize: 10,
    });

    await binding?.start();
    await consumer.emit({
      topic: "petstore.pets.v1",
      partition: 0,
      offset: "1",
      key: "pet-1",
      value: JSON.stringify({ petId: "pet-1", species: "cat", name: "Miso" }),
    });
    await consumer.emit({
      topic: "petstore.pets.v1",
      partition: 0,
      offset: "2",
      key: "pet-2",
      value: JSON.stringify({ petId: "pet-2", species: "dog", name: "Nori" }),
    });

    const firstPage = await binding?.getNextMessages({ max: 1 });
    expect(firstPage?.structuredContent).toMatchObject({
      topic: "petstore.pets.v1",
      messages: [
        {
          cursor: "petstore.pets.v1/0/1",
          key: "pet-1",
          payload: { petId: "pet-1", species: "cat", name: "Miso" },
        },
      ],
      nextCursor: "petstore.pets.v1/0/1",
    });

    const secondPage = await binding?.getNextMessages({
      cursor: firstPage?.structuredContent.nextCursor,
      max: 10,
    });
    expect(secondPage?.structuredContent.messages.map((message) => message.key)).toEqual(["pet-2"]);
  });

  it("evicts oldest messages when the bounded buffer is full", async () => {
    const consumer = new RecordingConsumer();
    const [binding] = await buildKafkaConsumeBindings(petstoreAsyncApi, {
      consumer,
      bufferSize: 2,
    });

    await binding?.start();
    for (const id of ["1", "2", "3"]) {
      await consumer.emit({
        topic: "petstore.pets.v1",
        partition: 0,
        offset: id,
        key: `pet-${id}`,
        value: JSON.stringify({ petId: `pet-${id}`, species: "cat", name: `Pet ${id}` }),
      });
    }

    const page = await binding?.getNextMessages({ max: 10 });
    expect(page?.structuredContent.messages.map((message) => message.key)).toEqual([
      "pet-2",
      "pet-3",
    ]);
    expect(page?.structuredContent.evictedBeforeCursor).toBe("petstore.pets.v1/0/2");
  });

  it("notifies subscribed resources when new messages arrive", async () => {
    const notifications: Array<{ resourceUri: string; cursor: string }> = [];
    const consumer = new RecordingConsumer();
    const [binding] = await buildKafkaConsumeBindings(petstoreAsyncApi, {
      consumer,
      notificationSink: (notification) => {
        notifications.push(notification);
      },
    });

    await binding?.start();
    binding?.subscribeResource("session-1");
    await consumer.emit({
      topic: "petstore.pets.v1",
      partition: 1,
      offset: "7",
      key: "pet-7",
      value: JSON.stringify({ petId: "pet-7", species: "rabbit", name: "Bun" }),
    });

    expect(notifications).toEqual([
      {
        resourceUri: "asyncapi://consume/consume_pet_events/petstore.pets.v1",
        cursor: "petstore.pets.v1/1/7",
      },
    ]);
    expect(binding?.resource).toMatchObject({
      uri: "asyncapi://consume/consume_pet_events/petstore.pets.v1",
      name: "consume_pet_events",
      mimeType: "application/json",
    });
  });
});

class RecordingConsumer implements KafkaConsumer {
  private handler?: KafkaMessageHandler;

  async subscribe(options: {
    topic: string;
    onMessage: KafkaMessageHandler;
  }): Promise<KafkaSubscription> {
    this.handler = options.onMessage;
    return { close: async () => undefined };
  }

  async emit(message: KafkaConsumedMessage): Promise<void> {
    await this.handler?.(message);
  }
}
