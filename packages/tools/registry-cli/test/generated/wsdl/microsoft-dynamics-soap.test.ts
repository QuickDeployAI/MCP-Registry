import { describeGeneratedMcpManifest } from "../generated-test-helpers";

describeGeneratedMcpManifest({
  family: "wsdl",
  provider: "microsoft-dynamics-soap",
  manifestPath: "registry/microsoft-dynamics-soap/soap.mcp.json",
  manifest: {
    "apiVersion": "quickdeploy.ai/v1",
    "kind": "McpManifest",
    "metadata": {
      "name": "ai.quickdeploy/microsoft-dynamics-soap",
      "version": "0.1.0",
      "title": "Microsoft Dynamics Legacy SOAP",
      "description": "Generated wsdl-2-mcp MCP manifest for Microsoft Dynamics legacy SOAP.",
      "labels": [
        "generated",
        "legacy",
        "microsoft-dynamics-soap",
        "read-only",
        "soap",
        "wsdl"
      ]
    },
    "spec": {
      "importer": {
        "engine": "wsdl-2-mcp",
        "versionRange": "^0.1.0"
      },
      "source": {
        "type": "http",
        "uri": "https://learn.microsoft.com/power-apps/developer/data-platform/org-service/overview",
        "digest": "sha256:ea34b0cd3e447107091fd087214dbd6f5c0aa89bce2e57336b3bf4b18775e813",
        "ref": "dynamics-365-org-service-legacy-soap-endpoint-docs@2026-07-09"
      },
      "select": {
        "requests": [
          {
            "method": "SOAP",
            "uriTemplate": "IOrganizationService/Retrieve"
          },
          {
            "method": "SOAP",
            "uriTemplate": "IOrganizationService/RetrieveMultiple"
          },
          {
            "method": "SOAP",
            "uriTemplate": "IOrganizationService/Execute"
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
            "env": "MICROSOFT_DYNAMICS_SOAP_ACCESS_TOKEN"
          }
        }
      ],
      "config": {
        "schema": {
          "type": "object",
          "properties": {
            "endpoint": {
              "type": "string",
              "format": "uri",
              "description": "Dynamics 365 / Dataverse Organization service endpoint, e.g. https://{org}.crm.dynamics.com/XRMServices/2011/Organization.svc."
            },
            "requestTimeoutMs": {
              "type": "number",
              "minimum": 1,
              "description": "Per-request SOAP upstream timeout in milliseconds."
            }
          }
        },
        "defaults": {
          "endpoint": "https://example.invalid/XRMServices/2011/Organization.svc",
          "requestTimeoutMs": 30000
        },
        "ai.quickdeploy.codegen/source": {
          "uri": "https://learn.microsoft.com/power-apps/developer/data-platform/org-service/overview",
          "type": "http",
          "digest": "sha256:ea34b0cd3e447107091fd087214dbd6f5c0aa89bce2e57336b3bf4b18775e813",
          "ref": "dynamics-365-org-service-legacy-soap-endpoint-docs@2026-07-09",
          "retrievedAt": "2026-07-09",
          "sourceVersion": "dynamics-365-org-service-legacy-soap-endpoint-docs@2026-07-09",
          "notes": [
            "Official Microsoft Learn documentation page describing the Dynamics 365 / Dataverse Organization service, its IOrganizationService SOAP messages, and the deprecated 2011 SOAP endpoint (XRMServices/2011/Organization.svc).",
            "Microsoft does not publish a single first-party public WSDL document for this per-tenant endpoint; this manifest pins the official documentation source used for the catalog entry, matching the Salesforce/Airtable/Google Eventarc precedent (QUI-351, QUI-366, QUI-372) for providers without a fetchable first-party machine-readable artifact.",
            "Canonical source URL: https://learn.microsoft.com/power-apps/developer/data-platform/org-service/overview",
            "Verified source SHA-256: ea34b0cd3e447107091fd087214dbd6f5c0aa89bce2e57336b3bf4b18775e813",
            "The committed manifest selects read-only IOrganizationService SOAP operations only (Retrieve, RetrieveMultiple, Execute/WhoAmI)."
          ]
        },
        "ai.quickdeploy.codegen/policy": {
          "network": [
            "GET https://learn.microsoft.com/power-apps/developer/data-platform/org-service/overview for source retrieval",
            "SOAP POST https://<dynamics-instance>/XRMServices/2011/Organization.svc for selected upstream operation (IOrganizationService/Retrieve)",
            "SOAP POST https://<dynamics-instance>/XRMServices/2011/Organization.svc for selected upstream operation (IOrganizationService/RetrieveMultiple)",
            "SOAP POST https://<dynamics-instance>/XRMServices/2011/Organization.svc for selected upstream operation (IOrganizationService/Execute)"
          ],
          "filesystem": [
            "Read committed manifest registry/microsoft-dynamics-soap/soap.mcp.json",
            "Read committed generated test packages/tools/registry-cli/test/generated/wsdl/microsoft-dynamics-soap.test.ts",
            "Read/write gitignored generated project .generated/mcp-codegen/wsdl/microsoft-dynamics-soap/"
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
            "from": "SOAP IOrganizationService/Retrieve",
            "name": "soap_iorganizationservice_retrieve",
            "deny": false
          },
          {
            "from": "SOAP IOrganizationService/RetrieveMultiple",
            "name": "soap_iorganizationservice_retrievemultiple",
            "deny": false
          },
          {
            "from": "SOAP IOrganizationService/Execute",
            "name": "soap_iorganizationservice_execute",
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
        "uri": "https://learn.microsoft.com/power-apps/developer/data-platform/org-service/overview",
        "type": "http",
        "digest": "sha256:ea34b0cd3e447107091fd087214dbd6f5c0aa89bce2e57336b3bf4b18775e813",
        "ref": "dynamics-365-org-service-legacy-soap-endpoint-docs@2026-07-09",
        "retrievedAt": "2026-07-09",
        "sourceVersion": "dynamics-365-org-service-legacy-soap-endpoint-docs@2026-07-09",
        "notes": [
          "Official Microsoft Learn documentation page describing the Dynamics 365 / Dataverse Organization service, its IOrganizationService SOAP messages, and the deprecated 2011 SOAP endpoint (XRMServices/2011/Organization.svc).",
          "Microsoft does not publish a single first-party public WSDL document for this per-tenant endpoint; this manifest pins the official documentation source used for the catalog entry, matching the Salesforce/Airtable/Google Eventarc precedent (QUI-351, QUI-366, QUI-372) for providers without a fetchable first-party machine-readable artifact.",
          "Canonical source URL: https://learn.microsoft.com/power-apps/developer/data-platform/org-service/overview",
          "Verified source SHA-256: ea34b0cd3e447107091fd087214dbd6f5c0aa89bce2e57336b3bf4b18775e813",
          "The committed manifest selects read-only IOrganizationService SOAP operations only (Retrieve, RetrieveMultiple, Execute/WhoAmI)."
        ]
      },
      "ai.quickdeploy.codegen/policy": {
        "network": [
          "GET https://learn.microsoft.com/power-apps/developer/data-platform/org-service/overview for source retrieval",
          "SOAP POST https://<dynamics-instance>/XRMServices/2011/Organization.svc for selected upstream operation (IOrganizationService/Retrieve)",
          "SOAP POST https://<dynamics-instance>/XRMServices/2011/Organization.svc for selected upstream operation (IOrganizationService/RetrieveMultiple)",
          "SOAP POST https://<dynamics-instance>/XRMServices/2011/Organization.svc for selected upstream operation (IOrganizationService/Execute)"
        ],
        "filesystem": [
          "Read committed manifest registry/microsoft-dynamics-soap/soap.mcp.json",
          "Read committed generated test packages/tools/registry-cli/test/generated/wsdl/microsoft-dynamics-soap.test.ts",
          "Read/write gitignored generated project .generated/mcp-codegen/wsdl/microsoft-dynamics-soap/"
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
        "from": "SOAP IOrganizationService/Retrieve",
        "name": "soap_iorganizationservice_retrieve",
        "deny": false
      },
      {
        "from": "SOAP IOrganizationService/RetrieveMultiple",
        "name": "soap_iorganizationservice_retrievemultiple",
        "deny": false
      },
      {
        "from": "SOAP IOrganizationService/Execute",
        "name": "soap_iorganizationservice_execute",
        "deny": false
      }
    ],
    "resources": [],
    "prompts": [],
    "authEnvVars": [
      "MICROSOFT_DYNAMICS_SOAP_ACCESS_TOKEN"
    ],
    "serverEnvVars": [
      "MICROSOFT_DYNAMICS_SOAP_ACCESS_TOKEN"
    ]
  },
});
