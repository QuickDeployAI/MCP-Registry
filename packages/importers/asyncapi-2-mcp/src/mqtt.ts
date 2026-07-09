import mqtt, { type MqttClient } from "mqtt";
import type { MqttProducer, MqttPublishAck, MqttPublishRequest } from "./types";

export interface MqttProducerConfig {
  url: string;
  clientId?: string;
  username?: string;
  password?: string;
}

export interface ManagedMqttProducer extends MqttProducer {
  disconnect(): Promise<void>;
}

export async function createMqttProducer(config: MqttProducerConfig): Promise<ManagedMqttProducer> {
  const client = await new Promise<MqttClient>((resolve, reject) => {
    const candidate = mqtt.connect(config.url, {
      clientId: config.clientId,
      username: config.username,
      password: config.password,
    });
    candidate.once("connect", () => resolve(candidate));
    candidate.once("error", (error) => {
      candidate.end(true);
      reject(error);
    });
  });

  return new MqttJsProducer(client);
}

class MqttJsProducer implements ManagedMqttProducer {
  constructor(private readonly client: MqttClient) {}

  async publish(request: MqttPublishRequest): Promise<MqttPublishAck> {
    await new Promise<void>((resolve, reject) => {
      this.client.publish(
        request.topic,
        request.payload,
        { qos: request.qos, retain: request.retain },
        (error) => (error ? reject(error) : resolve()),
      );
    });

    return { topic: request.topic, qos: request.qos, retain: request.retain };
  }

  async disconnect(): Promise<void> {
    await new Promise<void>((resolve) => {
      this.client.end(false, {}, () => resolve());
    });
  }
}
