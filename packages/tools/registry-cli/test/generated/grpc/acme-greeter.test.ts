import { describeGeneratedMcpManifest } from "../generated-test-helpers";

describeGeneratedMcpManifest({
  family: "grpc",
  provider: "acme-greeter",
  manifestPath: "registry/acme-greeter/proto.mcp.json",
  manifest: {
    "apiVersion": "quickdeploy.ai/v1",
    "kind": "McpManifest",
    "metadata": {
      "name": "ai.quickdeploy/acme-greeter",
      "version": "0.1.0",
      "title": "Acme Greeter",
      "description": "Generated grpc-2-mcp MCP manifest for Acme Greeter.",
      "labels": [
        "acme-greeter",
        "generated",
        "grpc"
      ]
    },
    "spec": {
      "importer": {
        "engine": "grpc-2-mcp",
        "versionRange": "^0.1.0"
      },
      "source": {
        "type": "file",
        "uri": "file://fixtures/acme-greeter.binpb"
      },
      "select": {
        "requests": [],
        "grpcMethods": [
          {
            "service": "acme.greeter.Greeter",
            "method": "SayHello"
          }
        ],
        "pythonFunctions": [],
        "skills": [],
        "knowledgeSources": [],
        "corpusGlobs": []
      },
      "auth": [
        {
          "type": "bearer",
          "valueFrom": {
            "env": "ACME_GRPC_TOKEN"
          }
        }
      ],
      "config": {
        "schema": {
          "type": "object",
          "properties": {
            "endpoint": {
              "type": "string"
            },
            "tls": {
              "type": "boolean"
            }
          },
          "required": [
            "endpoint"
          ]
        },
        "defaults": {
          "tls": true
        },
        "ai.quickdeploy.codegen/source": {
          "uri": "file://fixtures/acme-greeter.binpb",
          "type": "file",
          "retrievedAt": "2026-07-09",
          "sourceVersion": "sha256:test-descriptor"
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
            "from": "acme.greeter.Greeter/SayHello",
            "name": "acme_greeter_greeter_sayhello",
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
        "uri": "file://fixtures/acme-greeter.binpb",
        "type": "file",
        "retrievedAt": "2026-07-09",
        "sourceVersion": "sha256:test-descriptor"
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
        "from": "acme.greeter.Greeter/SayHello",
        "name": "acme_greeter_greeter_sayhello",
        "deny": false
      }
    ],
    "resources": [],
    "prompts": [],
    "authEnvVars": [
      "ACME_GRPC_TOKEN"
    ],
    "serverEnvVars": [
      "ACME_GRPC_TOKEN",
      "QD_MANIFEST_ENDPOINT"
    ]
  },
});
