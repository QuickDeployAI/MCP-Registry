import { describeGeneratedMcpManifest } from "../generated-test-helpers";

describeGeneratedMcpManifest({
  family: "openapi",
  provider: "docusign",
  manifestPath: "registry/docusign/api.mcp.json",
  manifest: {
    "apiVersion": "quickdeploy.ai/v1",
    "kind": "McpManifest",
    "metadata": {
      "name": "ai.quickdeploy/docusign",
      "version": "0.1.0",
      "title": "DocuSign",
      "description": "Generated DocuSign eSignature Envelopes read-only OpenAPI MCP catalog manifest.",
      "labels": [
        "generated",
        "openapi",
        "read-only",
        "esignature",
        "docusign"
      ]
    },
    "spec": {
      "importer": {
        "engine": "openapi-2-mcp",
        "versionRange": "^0.1.0"
      },
      "source": {
        "type": "http",
        "uri": "https://raw.githubusercontent.com/docusign/OpenAPI-Specifications/master/esignature.rest.swagger-v2.1.json",
        "digest": "sha256:77f1998c313d69701eca52cb80e860c2a4b7e97bdceea11fd0427f9405f06c2e",
        "ref": "docusign-esignature-rest-api@v2.1"
      },
      "select": {
        "requests": [
          {
            "method": "GET",
            "uriTemplate": "/v2.1/accounts/{accountId}/envelopes"
          },
          {
            "method": "GET",
            "uriTemplate": "/v2.1/accounts/{accountId}/envelopes/{envelopeId}"
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
          "type": "bearer",
          "valueFrom": {
            "env": "DOCUSIGN_ACCESS_TOKEN"
          }
        }
      ],
      "config": {
        "schema": {
          "type": "object",
          "properties": {
            "baseUrl": {
              "type": "string",
              "format": "uri",
              "description": "DocuSign eSignature REST API base URL, e.g. https://{account-domain}.docusign.net/restapi."
            },
            "requestTimeoutMs": {
              "type": "number",
              "minimum": 1,
              "description": "Per-request upstream timeout in milliseconds."
            },
            "mode": {
              "type": "string",
              "description": "Importer execution profile."
            }
          },
          "required": [
            "baseUrl"
          ]
        },
        "defaults": {
          "requestTimeoutMs": 30000,
          "mode": "read-only"
        },
        "ai.quickdeploy.codegen/source": {
          "uri": "https://raw.githubusercontent.com/docusign/OpenAPI-Specifications/master/esignature.rest.swagger-v2.1.json",
          "type": "http",
          "digest": "sha256:77f1998c313d69701eca52cb80e860c2a4b7e97bdceea11fd0427f9405f06c2e",
          "ref": "docusign-esignature-rest-api@v2.1",
          "retrievedAt": "2026-07-09",
          "sourceVersion": "docusign-esignature-rest-api@v2.1",
          "notes": [
            "Official Docusign REST APIs Swagger Specifications repository (docusign/OpenAPI-Specifications): https://github.com/docusign/OpenAPI-Specifications",
            "Canonical source URL: https://raw.githubusercontent.com/docusign/OpenAPI-Specifications/master/esignature.rest.swagger-v2.1.json",
            "OpenAPI document info: title \"Docusign eSignature REST API\", version v2.1.",
            "The document does not declare a securityDefinitions block; DocuSign documents its OAuth2 (JWT Grant / Authorization Code Grant) Bearer access token flow separately, so auth is modeled as bearer, matching the Salesforce entry in this catalog.",
            "Verified source SHA-256: 77f1998c313d69701eca52cb80e860c2a4b7e97bdceea11fd0427f9405f06c2e",
            "The committed manifest selects read-only DocuSign eSignature envelope list/get operations only (Envelopes_GetEnvelopes, Envelopes_GetEnvelope)."
          ]
        },
        "ai.quickdeploy.codegen/policy": {
          "network": [
            "GET https://raw.githubusercontent.com/docusign/OpenAPI-Specifications/master/esignature.rest.swagger-v2.1.json for source retrieval",
            "GET https://<docusign-account-domain>.docusign.net/restapi/v2.1/accounts/{accountId}/envelopes for selected upstream operation",
            "GET https://<docusign-account-domain>.docusign.net/restapi/v2.1/accounts/{accountId}/envelopes/{envelopeId} for selected upstream operation"
          ],
          "filesystem": [
            "Read committed manifest registry/docusign/api.mcp.json",
            "Read committed generated test packages/tools/registry-cli/test/generated/openapi/docusign.test.ts",
            "Read/write gitignored generated project .generated/mcp-codegen/openapi/docusign/"
          ],
          "process": [
            "Run pnpm build/test scripts only inside OpenShell-backed MXC isolation",
            "Run node only as invoked by generated project package scripts inside OpenShell-backed MXC isolation"
          ],
          "generatedExecution": "openshell-mxc-only",
          "unavailableRuntime": "fail-closed"
        }
      },
      "expose": {
        "tools": [
          {
            "from": "GET /v2.1/accounts/{accountId}/envelopes",
            "name": "list_docusign_envelopes",
            "deny": false
          },
          {
            "from": "GET /v2.1/accounts/{accountId}/envelopes/{envelopeId}",
            "name": "get_docusign_envelope",
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
        "uri": "https://raw.githubusercontent.com/docusign/OpenAPI-Specifications/master/esignature.rest.swagger-v2.1.json",
        "type": "http",
        "digest": "sha256:77f1998c313d69701eca52cb80e860c2a4b7e97bdceea11fd0427f9405f06c2e",
        "ref": "docusign-esignature-rest-api@v2.1",
        "retrievedAt": "2026-07-09",
        "sourceVersion": "docusign-esignature-rest-api@v2.1",
        "notes": [
          "Official Docusign REST APIs Swagger Specifications repository (docusign/OpenAPI-Specifications): https://github.com/docusign/OpenAPI-Specifications",
          "Canonical source URL: https://raw.githubusercontent.com/docusign/OpenAPI-Specifications/master/esignature.rest.swagger-v2.1.json",
          "OpenAPI document info: title \"Docusign eSignature REST API\", version v2.1.",
          "The document does not declare a securityDefinitions block; DocuSign documents its OAuth2 (JWT Grant / Authorization Code Grant) Bearer access token flow separately, so auth is modeled as bearer, matching the Salesforce entry in this catalog.",
          "Verified source SHA-256: 77f1998c313d69701eca52cb80e860c2a4b7e97bdceea11fd0427f9405f06c2e",
          "The committed manifest selects read-only DocuSign eSignature envelope list/get operations only (Envelopes_GetEnvelopes, Envelopes_GetEnvelope)."
        ]
      },
      "ai.quickdeploy.codegen/policy": {
        "network": [
          "GET https://raw.githubusercontent.com/docusign/OpenAPI-Specifications/master/esignature.rest.swagger-v2.1.json for source retrieval",
          "GET https://<docusign-account-domain>.docusign.net/restapi/v2.1/accounts/{accountId}/envelopes for selected upstream operation",
          "GET https://<docusign-account-domain>.docusign.net/restapi/v2.1/accounts/{accountId}/envelopes/{envelopeId} for selected upstream operation"
        ],
        "filesystem": [
          "Read committed manifest registry/docusign/api.mcp.json",
          "Read committed generated test packages/tools/registry-cli/test/generated/openapi/docusign.test.ts",
          "Read/write gitignored generated project .generated/mcp-codegen/openapi/docusign/"
        ],
        "process": [
          "Run pnpm build/test scripts only inside OpenShell-backed MXC isolation",
          "Run node only as invoked by generated project package scripts inside OpenShell-backed MXC isolation"
        ],
        "generatedExecution": "openshell-mxc-only",
        "unavailableRuntime": "fail-closed"
      }
    }
  },
  expected: {
    "tools": [
      {
        "from": "GET /v2.1/accounts/{accountId}/envelopes",
        "name": "list_docusign_envelopes",
        "deny": false
      },
      {
        "from": "GET /v2.1/accounts/{accountId}/envelopes/{envelopeId}",
        "name": "get_docusign_envelope",
        "deny": false
      }
    ],
    "resources": [],
    "prompts": [],
    "authEnvVars": [
      "DOCUSIGN_ACCESS_TOKEN"
    ],
    "serverEnvVars": [
      "DOCUSIGN_ACCESS_TOKEN",
      "QD_MANIFEST_BASE_URL"
    ]
  },
});
