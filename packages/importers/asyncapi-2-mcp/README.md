# @quickdeployai/asyncapi-2-mcp

AsyncAPI v3 importer utilities for the MCP Everywhere program.

This package supports:

- parse and validate AsyncAPI documents with the official `@asyncapi/parser`;
- generate one MCP-style publish tool per `send` operation, shared across brokers via a small `PublishBinding` interface (`src/binding.ts`) that isolates target resolution, extra input fields, and the send call — operation discovery, payload validation, and tool naming stay identical regardless of broker;
- validate publish payloads against the operation message JSON Schema before producing;
- route Kafka publishes to the channel binding topic or channel address; route MQTT publishes to the channel address, interpolating `{param}` placeholders from caller-supplied input, with QoS/retain read from the operation or channel `mqtt` binding;
- keep Kafka and MQTT behind small producer ports so tests and future `mcp-host` integration can reuse the same tool path;
- generate consume bindings for `receive` operations with a bounded local buffer, `get_next_messages`, `peek_latest`, and resource update notifications.

Consume bindings make the broker contract explicit but do not promise durable replay: messages are retained only while they remain in the bounded buffer. Use consumer-group durable storage outside this package when restart-safe replay is required.

## Example

```ts
import { buildKafkaPublishTools } from "@quickdeployai/asyncapi-2-mcp";
import { createKafkaProducer } from "@quickdeployai/asyncapi-2-mcp/kafka";

const producer = await createKafkaProducer({
  clientId: "asyncapi-2-mcp",
  brokers: ["localhost:9092"],
});

const tools = await buildKafkaPublishTools(asyncApiYaml, { producer });
const publishPetCreated = tools.find((tool) => tool.name === "publish_pet_created");

await publishPetCreated?.publish({
  petId: "pet-123",
  species: "cat",
  name: "Miso",
});
```

Kafka message keys default to `key`, then `partitionKey`, then an `x-kafka-key` field name or JSON pointer, then common payload ids such as `petId` or `id`.

## MQTT publish binding

```ts
import { buildMqttPublishTools } from "@quickdeployai/asyncapi-2-mcp";
import { createMqttProducer } from "@quickdeployai/asyncapi-2-mcp/mqtt";

const producer = await createMqttProducer({ url: "mqtt://localhost:1883" });

const tools = await buildMqttPublishTools(asyncApiYaml, { producer });
const publishTelemetry = tools.find((tool) => tool.name === "publish_telemetry");

// Channel address `fleet/{deviceId}/telemetry` requires `deviceId` as an extra
// tool input alongside the message payload; it is interpolated into the topic.
await publishTelemetry?.publish({ deviceId: "rig-42", temperatureC: 21.5 });
```

QoS and `retain` come from the operation's (or channel's) `bindings.mqtt` object — they are not caller-supplied, matching the AsyncAPI MQTT binding contract. Topic template parameters are derived from `{name}` placeholders in the channel `address` and become required string properties on the generated tool's input schema; a publish call missing one fails fast with a clear error instead of silently producing to a malformed topic.

## Consume-side buffers

```ts
import { buildKafkaConsumeBindings } from "@quickdeployai/asyncapi-2-mcp";

const [events] = await buildKafkaConsumeBindings(asyncApiYaml, {
  consumer,
  bufferSize: 100,
  notificationSink: ({ resourceUri, cursor }) => {
    console.log(`resource changed: ${resourceUri} at ${cursor}`);
  },
});

await events?.start();
events?.subscribeResource("session-123");

const firstPage = await events?.getNextMessages({ max: 25 });
const nextPage = await events?.getNextMessages({
  cursor: firstPage?.structuredContent.nextCursor,
  max: 25,
});
const latest = await events?.peekLatest({ max: 5 });
```

Each receive binding subscribes to the AsyncAPI channel binding topic or channel address. Incoming Kafka messages are stored as JSON envelopes with an opaque cursor of `topic/partition/offset`. When the buffer evicts old entries, `evictedBeforeCursor` tells callers the earliest retained cursor so agents can surface bounded-replay caveats honestly.
