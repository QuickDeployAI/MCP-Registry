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
      "description": "Generated wsdl-2-mcp MCP manifest for the Dynamics 365 2011 Organization.svc SOAP endpoint.",
      "labels": [
        "crm",
        "dynamics",
        "generated",
        "legacy",
        "microsoft-dynamics-soap",
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
        "uri": "https://learn.microsoft.com/en-us/dynamics365/customerengagement/on-premises/developer/developer-resources-page?view=op-9-1",
        "digest": "sha256:1d3050600323242fbdb563871a5c10d3da582df919a8a2ac4e9eb5b3f10e46fa",
        "ref": "op-9-1"
      },
      "select": {
        "requests": [
          {
            "method": "SOAP",
            "uriTemplate": "Organization/Execute"
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
              "type": "string"
            }
          },
          "required": [
            "endpoint"
          ]
        },
        "defaults": {},
        "ai.quickdeploy.codegen/source": {
          "uri": "https://learn.microsoft.com/en-us/dynamics365/customerengagement/on-premises/developer/developer-resources-page?view=op-9-1",
          "type": "http",
          "digest": "sha256:1d3050600323242fbdb563871a5c10d3da582df919a8a2ac4e9eb5b3f10e46fa",
          "ref": "op-9-1",
          "retrievedAt": "2026-07-09",
          "sourceVersion": "op-9-1",
          "notes": [
            "Microsoft Dynamics 365 Customer Engagement (on-premises) has no single public WSDL file: the 2011 Organization service SOAP endpoint (Organization.svc) is deployed per organization/tenant, so this manifest pins the official Microsoft Learn developer resources page documenting the endpoint URL pattern and the IOrganizationService contract instead.",
            "Per the official IOrganizationService Interface documentation (https://learn.microsoft.com/power-apps/developer/data-platform/org-service/iorganizationservice-interface), the Organization service exposes only the Execute SOAP operation; the other IOrganizationService methods (Create, Retrieve, RetrieveMultiple, Update, Delete, Associate, Disassociate) are client-side SDK helper wrappers around Execute, not separate wire operations."
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
            "from": "SOAP Organization/Execute",
            "name": "soap_organization_execute",
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
        "uri": "https://learn.microsoft.com/en-us/dynamics365/customerengagement/on-premises/developer/developer-resources-page?view=op-9-1",
        "type": "http",
        "digest": "sha256:1d3050600323242fbdb563871a5c10d3da582df919a8a2ac4e9eb5b3f10e46fa",
        "ref": "op-9-1",
        "retrievedAt": "2026-07-09",
        "sourceVersion": "op-9-1",
        "notes": [
          "Microsoft Dynamics 365 Customer Engagement (on-premises) has no single public WSDL file: the 2011 Organization service SOAP endpoint (Organization.svc) is deployed per organization/tenant, so this manifest pins the official Microsoft Learn developer resources page documenting the endpoint URL pattern and the IOrganizationService contract instead.",
          "Per the official IOrganizationService Interface documentation (https://learn.microsoft.com/power-apps/developer/data-platform/org-service/iorganizationservice-interface), the Organization service exposes only the Execute SOAP operation; the other IOrganizationService methods (Create, Retrieve, RetrieveMultiple, Update, Delete, Associate, Disassociate) are client-side SDK helper wrappers around Execute, not separate wire operations."
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
        "from": "SOAP Organization/Execute",
        "name": "soap_organization_execute",
        "deny": false
      }
    ],
    "resources": [],
    "prompts": [],
    "authEnvVars": [
      "MICROSOFT_DYNAMICS_SOAP_ACCESS_TOKEN"
    ],
    "serverEnvVars": [
      "MICROSOFT_DYNAMICS_SOAP_ACCESS_TOKEN",
      "QD_MANIFEST_ENDPOINT"
    ]
  },
});
