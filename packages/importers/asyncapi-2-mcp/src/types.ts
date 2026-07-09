export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue | undefined };

export type JsonObject = { [key: string]: JsonValue | undefined };
export type JsonSchema = JsonObject;

export interface AsyncApiDocument extends JsonObject {
  asyncapi?: string;
  info?: JsonObject;
  channels?: Record<string, JsonObject | undefined>;
  operations?: Record<string, JsonObject | undefined>;
  components?: JsonObject;
}

export interface PublishToolInput extends JsonObject {
  key?: string;
  partitionKey?: string;
  headers?: Record<string, string>;
}

export interface KafkaPublishMessage {
  key?: string;
  value: string;
  headers?: Record<string, string>;
}

export interface KafkaPublishRequest {
  topic: string;
  messages: KafkaPublishMessage[];
}

export interface KafkaPublishAck {
  topicName?: string;
  partition?: number;
  baseOffset?: string;
  logAppendTime?: string;
  logStartOffset?: string;
}

export interface KafkaProducer {
  send(request: KafkaPublishRequest): Promise<KafkaPublishAck[]>;
}

export type MqttQos = 0 | 1 | 2;

export interface MqttPublishRequest {
  topic: string;
  payload: string;
  qos: MqttQos;
  retain: boolean;
}

export interface MqttPublishAck {
  topic: string;
  qos: MqttQos;
  retain: boolean;
}

export interface MqttProducer {
  publish(request: MqttPublishRequest): Promise<MqttPublishAck>;
}

export interface KafkaConsumedMessage {
  topic: string;
  partition?: number;
  offset?: string;
  key?: string;
  value: string;
  headers?: Record<string, string>;
  timestamp?: string;
}

export type KafkaMessageHandler = (message: KafkaConsumedMessage) => Promise<void> | void;

export interface KafkaSubscription {
  close(): Promise<void>;
}

export interface KafkaConsumer {
  subscribe(request: {
    topic: string;
    fromBeginning?: boolean;
    onMessage: KafkaMessageHandler;
  }): Promise<KafkaSubscription>;
}

export interface PublishToolResult {
  content: Array<{ type: "text"; text: string }>;
  structuredContent: {
    accepted: true;
    messageName: string;
    broker: string;
    topic: string;
  };
  _meta: Record<string, JsonValue | undefined>;
}

export interface PublishTool {
  operationId: string;
  name: string;
  description: string;
  inputSchema: JsonSchema;
  publish(input: PublishToolInput): Promise<PublishToolResult>;
}

export interface ConsumeToolInput extends JsonObject {
  cursor?: string;
  max?: number;
}

export interface ConsumedMessageEnvelope {
  cursor: string;
  topic: string;
  partition?: number;
  offset?: string;
  key?: string;
  headers?: Record<string, string>;
  payload: JsonValue;
  receivedAt: string;
}

export interface ConsumeToolResult {
  content: Array<{ type: "text"; text: string }>;
  structuredContent: {
    topic: string;
    messages: ConsumedMessageEnvelope[];
    nextCursor?: string;
    evictedBeforeCursor?: string;
  };
}

export interface ConsumeResource {
  uri: string;
  name: string;
  mimeType: "application/json";
  description: string;
}

export interface ConsumeNotification {
  resourceUri: string;
  cursor: string;
}

export interface ConsumeTool {
  name: "get_next_messages" | "peek_latest";
  description: string;
  inputSchema: JsonSchema;
  call(input?: ConsumeToolInput): Promise<ConsumeToolResult>;
}

export interface ConsumeBinding {
  operationId: string;
  topic: string;
  resource: ConsumeResource;
  tools: ConsumeTool[];
  start(): Promise<void>;
  stop(): Promise<void>;
  subscribeResource(subscriptionId: string): void;
  unsubscribeResource(subscriptionId: string): void;
  getNextMessages(input?: ConsumeToolInput): Promise<ConsumeToolResult>;
  peekLatest(input?: ConsumeToolInput): Promise<ConsumeToolResult>;
}
