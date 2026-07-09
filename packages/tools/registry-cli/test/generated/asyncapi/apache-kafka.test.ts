import { describeGeneratedMcpManifest } from "../generated-test-helpers";

describeGeneratedMcpManifest({
  family: "asyncapi",
  provider: "apache-kafka",
  manifestPath: "registry/apache-kafka/events.mcp.json",
  manifest: {
    "apiVersion": "quickdeploy.ai/v1",
    "kind": "McpManifest",
    "metadata": {
      "name": "ai.quickdeploy/apache-kafka",
      "version": "0.1.0",
      "title": "Apache Kafka",
      "description": "Generated asyncapi-2-mcp MCP manifest for the Apache Kafka producer send operation.",
      "labels": [
        "apache-kafka",
        "asyncapi",
        "events",
        "generated",
        "kafka",
        "streaming"
      ]
    },
    "spec": {
      "importer": {
        "engine": "asyncapi-2-mcp",
        "versionRange": "^0.1.0"
      },
      "source": {
        "type": "http",
        "uri": "https://kafka.apache.org/43/javadoc/org/apache/kafka/clients/producer/ProducerRecord.html",
        "digest": "sha256:5cb724b7b97d8272dfe65d43ce3b069a9aa742c5cee08699d5d819e5f81d1fee"
      },
      "select": {
        "requests": [
          {
            "method": "PUBLISH",
            "uriTemplate": "channel://kafka.producer.send"
          }
        ],
        "grpcMethods": [],
        "pythonFunctions": [],
        "skills": [],
        "knowledgeSources": [],
        "corpusGlobs": []
      },
      "auth": [
        {
          "type": "basic",
          "usernameFrom": {
            "env": "APACHE_KAFKA_SASL_USERNAME"
          },
          "passwordFrom": {
            "env": "APACHE_KAFKA_SASL_PASSWORD"
          }
        }
      ],
      "config": {
        "schema": {
          "type": "object",
          "properties": {
            "bootstrapServers": {
              "type": "string",
              "description": "Comma-separated Kafka bootstrap server list (host:port,...)."
            },
            "brokerProtocol": {
              "type": "string",
              "description": "Delivery protocol for generated publish tools."
            },
            "publishTimeoutMs": {
              "type": "number",
              "minimum": 1,
              "description": "Per-publish timeout in milliseconds."
            }
          },
          "required": [
            "bootstrapServers"
          ]
        },
        "defaults": {
          "brokerProtocol": "kafka",
          "publishTimeoutMs": 30000
        },
        "ai.quickdeploy.codegen/source": {
          "uri": "https://kafka.apache.org/43/javadoc/org/apache/kafka/clients/producer/ProducerRecord.html",
          "type": "http",
          "digest": "sha256:5cb724b7b97d8272dfe65d43ce3b069a9aa742c5cee08699d5d819e5f81d1fee",
          "retrievedAt": "2026-07-09",
          "sourceVersion": "4.3",
          "notes": [
            "Apache Kafka is a binary wire-protocol message broker and does not publish an HTTP OpenAPI/AsyncAPI document; there is no single official 'Kafka API' spec to pin.",
            "This manifest instead pins the official Apache Kafka Producer API Javadoc (ProducerRecord), the canonical description of the produce/publish operation shape (topic, partition, key, value, timestamp, headers), from the current stable Kafka 4.3 release (4.3.1, released 2026-06-25).",
            "Verified source SHA-256: 5cb724b7b97d8272dfe65d43ce3b069a9aa742c5cee08699d5d819e5f81d1fee, confirmed byte-identical across two separate fetches.",
            "Auth models SASL/PLAIN or SASL/SCRAM (the common Kafka username/password SASL mechanisms) as HTTP Basic env refs; mTLS and other SASL mechanisms are out of scope for this manifest.",
            "bootstrapServers has no default: Kafka clusters have no universal public endpoint, unlike hosted SaaS APIs."
          ]
        },
        "ai.quickdeploy.codegen/policy": {
          "network": [
            "source-uri",
            "configured-upstream"
          ],
          "filesystem": [
            "generated-project-readwrite"
          ],
          "process": [
            "none"
          ],
          "generatedExecution": "openshell-mxc-only",
          "unavailableRuntime": "fail-closed"
        }
      },
      "expose": {
        "tools": [
          {
            "from": "PUBLISH channel://kafka.producer.send",
            "name": "publish_kafka_producer_record",
            "deny": false
          }
        ],
        "resources": [],
        "prompts": []
      }
    },
    "deployment": {
      "transport": "streamable-http",
      "auth": {
        "type": "none"
      },
      "userConfig": {}
    },
    "_meta": {
      "ai.quickdeploy.codegen/source": {
        "uri": "https://kafka.apache.org/43/javadoc/org/apache/kafka/clients/producer/ProducerRecord.html",
        "type": "http",
        "digest": "sha256:5cb724b7b97d8272dfe65d43ce3b069a9aa742c5cee08699d5d819e5f81d1fee",
        "retrievedAt": "2026-07-09",
        "sourceVersion": "4.3",
        "notes": [
          "Apache Kafka is a binary wire-protocol message broker and does not publish an HTTP OpenAPI/AsyncAPI document; there is no single official 'Kafka API' spec to pin.",
          "This manifest instead pins the official Apache Kafka Producer API Javadoc (ProducerRecord), the canonical description of the produce/publish operation shape (topic, partition, key, value, timestamp, headers), from the current stable Kafka 4.3 release (4.3.1, released 2026-06-25).",
          "Verified source SHA-256: 5cb724b7b97d8272dfe65d43ce3b069a9aa742c5cee08699d5d819e5f81d1fee, confirmed byte-identical across two separate fetches.",
          "Auth models SASL/PLAIN or SASL/SCRAM (the common Kafka username/password SASL mechanisms) as HTTP Basic env refs; mTLS and other SASL mechanisms are out of scope for this manifest.",
          "bootstrapServers has no default: Kafka clusters have no universal public endpoint, unlike hosted SaaS APIs."
        ]
      },
      "ai.quickdeploy.codegen/policy": {
        "network": [
          "source-uri",
          "configured-upstream"
        ],
        "filesystem": [
          "generated-project-readwrite"
        ],
        "process": [
          "none"
        ],
        "generatedExecution": "openshell-mxc-only",
        "unavailableRuntime": "fail-closed"
      }
    }
  },
  expected: {
    "tools": [
      {
        "from": "PUBLISH channel://kafka.producer.send",
        "name": "publish_kafka_producer_record",
        "deny": false
      }
    ],
    "resources": [],
    "prompts": [],
    "authEnvVars": [
      "APACHE_KAFKA_SASL_PASSWORD",
      "APACHE_KAFKA_SASL_USERNAME"
    ],
    "serverEnvVars": [
      "APACHE_KAFKA_SASL_PASSWORD",
      "APACHE_KAFKA_SASL_USERNAME",
      "QD_MANIFEST_BOOTSTRAP_SERVERS"
    ]
  },
});
