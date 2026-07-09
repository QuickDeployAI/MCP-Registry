import { buildPublishTools, type PublishBinding, type PublishOperationSpec } from "./binding";
import { AsyncApiImportError, getObject, numberValue, stringValue } from "./document-utils";
import { loadAsyncApiDocument } from "./publish";
import type {
  AsyncApiDocument,
  JsonObject,
  MqttProducer,
  MqttQos,
  PublishTool,
  PublishToolInput,
} from "./types";

interface BuildMqttPublishToolsOptions {
  producer: MqttProducer;
}

const TOPIC_PARAMETER_PATTERN = /\{([^{}]+)\}/g;

export async function buildMqttPublishTools(
  source: string | AsyncApiDocument,
  options: BuildMqttPublishToolsOptions,
): Promise<PublishTool[]> {
  const document = await loadAsyncApiDocument(source);
  return buildPublishTools(document, options.producer, mqttPublishBinding);
}

const mqttPublishBinding: PublishBinding<string, MqttProducer> = {
  broker: "mqtt",
  extraInputSchema: (spec) => {
    const properties: JsonObject = {};
    for (const name of topicParameterNames(stringValue(spec.channel.address))) {
      properties[name] = {
        type: "string",
        description: `Value for the {${name}} placeholder in the ${spec.channelName} topic address.`,
      };
    }
    return properties;
  },
  resolveTarget: (spec, input) => resolveMqttTopic(spec, input),
  send: async ({ producer, target, spec, payload }) => {
    const qos = mqttQos(spec);
    const retain = mqttRetain(spec);
    const ack = await producer.publish({
      topic: target,
      payload: JSON.stringify(payload),
      qos,
      retain,
    });

    return {
      content: [
        {
          type: "text",
          text: `Published ${spec.messageName} to ${target} (qos ${ack.qos}${ack.retain ? ", retained" : ""}).`,
        },
      ],
      structuredContent: {
        accepted: true,
        messageName: spec.messageName,
        broker: "mqtt",
        topic: target,
      },
      _meta: {
        qos: ack.qos,
        retain: ack.retain,
      },
    };
  },
};

function topicParameterNames(address: string | undefined): string[] {
  if (!address) return [];
  const names = new Set<string>();
  for (const match of address.matchAll(TOPIC_PARAMETER_PATTERN)) {
    const name = match[1];
    if (name) names.add(name);
  }
  return [...names];
}

function resolveMqttTopic(spec: PublishOperationSpec, input: PublishToolInput): string {
  const address = stringValue(spec.channel.address) ?? spec.channelName;
  return address.replace(TOPIC_PARAMETER_PATTERN, (placeholder, name: string) => {
    const value = stringValue(input[name]);
    if (!value) {
      throw new AsyncApiImportError(
        `Missing required topic parameter "${name}" for ${spec.channelName} (address template ${address}).`,
      );
    }
    return value;
  });
}

function mqttQos(spec: PublishOperationSpec): MqttQos {
  const qos =
    numberValue(getObject(getObject(spec.operation.bindings)?.mqtt)?.qos) ??
    numberValue(getObject(getObject(spec.channel.bindings)?.mqtt)?.qos) ??
    numberValue(getObject(getObject(spec.message.bindings)?.mqtt)?.qos) ??
    0;
  return qos === 1 || qos === 2 ? qos : 0;
}

function mqttRetain(spec: PublishOperationSpec): boolean {
  const operationMqtt = getObject(getObject(spec.operation.bindings)?.mqtt);
  const channelMqtt = getObject(getObject(spec.channel.bindings)?.mqtt);
  const retain = operationMqtt?.retain ?? channelMqtt?.retain;
  return retain === true;
}
