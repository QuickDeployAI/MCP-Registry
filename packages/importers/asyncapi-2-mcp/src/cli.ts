import { readFile } from "node:fs/promises";
import { Command } from "commander";
import { buildKafkaPublishTools } from "./publish";
import { buildMqttPublishTools } from "./publish-mqtt";
import { createKafkaProducer } from "./kafka";
import { createMqttProducer } from "./mqtt";
import type { PublishTool } from "./types";

async function runPublish(
  options: Record<string, string>,
  tools: PublishTool[],
  disconnect: () => Promise<void>,
): Promise<void> {
  try {
    const tool = tools.find((candidate) => candidate.operationId === options.operation);
    if (!tool) throw new Error(`No send operation found for ${options.operation}.`);
    const result = await tool.publish(JSON.parse(options.payload));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } finally {
    await disconnect();
  }
}

export function createAsyncApi2McpCommand(): Command {
  const command = new Command("asyncapi-2-mcp").description(
    "Generate and exercise AsyncAPI publish-side MCP tools.",
  );

  command
    .command("publish")
    .description("Publish through the Kafka binding.")
    .requiredOption("--spec <path>", "AsyncAPI v3 YAML or JSON document")
    .requiredOption("--operation <id>", "AsyncAPI send operation id")
    .requiredOption("--payload <json>", "JSON payload for the publish tool")
    .requiredOption("--brokers <list>", "Comma-separated Kafka broker list")
    .option("--client-id <id>", "Kafka client id", "asyncapi-2-mcp")
    .action(async (options: Record<string, string>) => {
      const spec = await readFile(options.spec, "utf8");
      const producer = await createKafkaProducer({
        clientId: options.clientId,
        brokers: options.brokers
          .split(",")
          .map((broker) => broker.trim())
          .filter(Boolean),
      });

      const tools = await buildKafkaPublishTools(spec, { producer });
      await runPublish(options, tools, () => producer.disconnect());
    });

  command
    .command("publish-mqtt")
    .description("Publish through the MQTT binding.")
    .requiredOption("--spec <path>", "AsyncAPI v3 YAML or JSON document")
    .requiredOption("--operation <id>", "AsyncAPI send operation id")
    .requiredOption(
      "--payload <json>",
      "JSON payload for the publish tool (topic parameters go here too)",
    )
    .requiredOption("--broker-url <url>", "MQTT broker URL, e.g. mqtt://localhost:1883")
    .option("--client-id <id>", "MQTT client id", "asyncapi-2-mcp")
    .action(async (options: Record<string, string>) => {
      const spec = await readFile(options.spec, "utf8");
      const producer = await createMqttProducer({
        url: options.brokerUrl,
        clientId: options.clientId,
      });

      const tools = await buildMqttPublishTools(spec, { producer });
      await runPublish(options, tools, () => producer.disconnect());
    });

  return command;
}
