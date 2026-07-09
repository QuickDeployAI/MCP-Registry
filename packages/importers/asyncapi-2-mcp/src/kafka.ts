import { Kafka, type Producer, type RecordMetadata } from "kafkajs";
import type { KafkaProducer, KafkaPublishAck, KafkaPublishRequest } from "./types";

export interface KafkaProducerConfig {
  clientId: string;
  brokers: string[];
}

export interface ManagedKafkaProducer extends KafkaProducer {
  disconnect(): Promise<void>;
}

export async function createKafkaProducer(
  config: KafkaProducerConfig,
): Promise<ManagedKafkaProducer> {
  const producer = new Kafka({
    clientId: config.clientId,
    brokers: config.brokers,
  }).producer();

  await producer.connect();
  return new KafkaJsProducer(producer);
}

class KafkaJsProducer implements ManagedKafkaProducer {
  constructor(private readonly producer: Producer) {}

  async send(request: KafkaPublishRequest): Promise<KafkaPublishAck[]> {
    const metadata = await this.producer.send(request);
    return metadata.map(toAck);
  }

  async disconnect(): Promise<void> {
    await this.producer.disconnect();
  }
}

function toAck(record: RecordMetadata): KafkaPublishAck {
  return {
    topicName: record.topicName,
    partition: record.partition,
    baseOffset: record.baseOffset,
    logAppendTime: record.logAppendTime,
    logStartOffset: record.logStartOffset,
  };
}
