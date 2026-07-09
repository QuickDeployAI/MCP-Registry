import { describe, expect, it } from "vitest";
import { AsyncApiImportError } from "./document-utils";
import { buildMqttPublishTools } from "./publish-mqtt";
import type { MqttProducer, MqttPublishRequest } from "./types";

const telemetryAsyncApi = `
asyncapi: 3.0.0
info:
  title: Fleet telemetry
  version: 1.0.0
channels:
  deviceTelemetry:
    address: "fleet/{deviceId}/telemetry"
    parameters:
      deviceId:
        description: Device identifier
    messages:
      telemetryReported:
        $ref: "#/components/messages/telemetryReported"
    bindings:
      mqtt:
        qos: 1
        retain: true
operations:
  publishTelemetry:
    action: send
    channel:
      $ref: "#/channels/deviceTelemetry"
    messages:
      - $ref: "#/channels/deviceTelemetry/messages/telemetryReported"
components:
  messages:
    telemetryReported:
      name: telemetry.reported
      payload:
        type: object
        required: [temperatureC]
        properties:
          temperatureC:
            type: number
`;

describe("buildMqttPublishTools", () => {
  it("generates a publish tool that interpolates channel parameters into the topic", async () => {
    const broker = new FixtureMosquittoBroker();
    const tools = await buildMqttPublishTools(telemetryAsyncApi, { producer: broker });

    expect(tools.map((tool) => tool.name)).toEqual(["publish_telemetry"]);
    expect(tools[0]?.inputSchema).toMatchObject({
      required: ["temperatureC"],
      properties: {
        temperatureC: { type: "number" },
        deviceId: { type: "string" },
      },
    });

    const result = await tools[0]?.publish({ deviceId: "rig-42", temperatureC: 21.5 });

    expect(broker.requests).toEqual([
      {
        topic: "fleet/rig-42/telemetry",
        payload: JSON.stringify({ temperatureC: 21.5 }),
        qos: 1,
        retain: true,
      },
    ]);
    expect(result).toMatchObject({
      structuredContent: {
        accepted: true,
        messageName: "telemetry.reported",
        broker: "mqtt",
        topic: "fleet/rig-42/telemetry",
      },
      _meta: { qos: 1, retain: true },
    });
  });

  it("rejects invalid payloads before publishing to the broker", async () => {
    const broker = new FixtureMosquittoBroker();
    const [tool] = await buildMqttPublishTools(telemetryAsyncApi, { producer: broker });

    await expect(tool?.publish({ deviceId: "rig-42" })).rejects.toThrow(AsyncApiImportError);
    expect(broker.requests).toEqual([]);
  });

  it("rejects a publish call missing a required topic parameter", async () => {
    const broker = new FixtureMosquittoBroker();
    const [tool] = await buildMqttPublishTools(telemetryAsyncApi, { producer: broker });

    await expect(tool?.publish({ temperatureC: 21.5 })).rejects.toThrow(
      /Missing required topic parameter "deviceId"/,
    );
    expect(broker.requests).toEqual([]);
  });

  it("defaults to QoS 0 and no retain when the channel omits mqtt bindings", async () => {
    const broker = new FixtureMosquittoBroker();
    const [tool] = await buildMqttPublishTools(
      {
        asyncapi: "3.0.0",
        info: { title: "Alerts", version: "1.0.0" },
        channels: {
          alerts: {
            address: "alerts.raised",
            messages: {
              alertRaised: {
                name: "alert.raised",
                payload: {
                  type: "object",
                  required: ["code"],
                  properties: { code: { type: "string" } },
                },
              },
            },
          },
        },
        operations: {
          publishAlert: {
            action: "send",
            channel: { $ref: "#/channels/alerts" },
          },
        },
      },
      { producer: broker },
    );

    await tool?.publish({ code: "over-temp" });

    expect(broker.requests[0]).toMatchObject({ topic: "alerts.raised", qos: 0, retain: false });
  });
});

/**
 * In-memory stand-in for a mosquitto broker: it implements the same
 * MqttProducer port a real `mqtt.js` client (see ./mqtt.ts) would, so the
 * tool pipeline (parsing, validation, topic templating, QoS/retain
 * resolution) is exercised end-to-end exactly as it would be against a live
 * broker, without requiring a network dependency in unit tests.
 */
class FixtureMosquittoBroker implements MqttProducer {
  readonly requests: MqttPublishRequest[] = [];

  async publish(request: MqttPublishRequest) {
    this.requests.push(request);
    return { topic: request.topic, qos: request.qos, retain: request.retain };
  }
}
