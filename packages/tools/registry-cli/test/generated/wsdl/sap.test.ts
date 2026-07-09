import { describeGeneratedMcpManifest } from "../generated-test-helpers";

describeGeneratedMcpManifest({
  family: "wsdl",
  provider: "sap",
  manifestPath: "registry/sap/soap.mcp.json",
  manifest: {
    "apiVersion": "quickdeploy.ai/v1",
    "kind": "McpManifest",
    "metadata": {
      "name": "ai.quickdeploy/sap",
      "version": "0.1.0",
      "title": "SAP",
      "description": "Generated SAP ERP Enterprise Services SOAP web service MCP catalog manifest.",
      "labels": [
        "enterprise-services",
        "erp",
        "generated",
        "read-only",
        "sap",
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
        "uri": "https://help.sap.com/docs/ABAP_PLATFORM_NEW/684cffda9cbc4187ad7dad790b03b983/4852347a08e672d0e10000000a42189c.html"
      },
      "select": {
        "requests": [
          {
            "method": "SOAP",
            "uriTemplate": "SalesOrderProcessing/SalesOrderERPCreateRequest_sync_V1"
          },
          {
            "method": "SOAP",
            "uriTemplate": "CustomerReplication/CustomerERPByIDQueryResponse_In"
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
            "env": "SAP_USERNAME"
          },
          "passwordFrom": {
            "env": "SAP_PASSWORD"
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
              "description": "SOAP endpoint override for the selected WSDL service port."
            },
            "requestTimeoutMs": {
              "type": "number",
              "minimum": 1,
              "description": "Per-request SOAP upstream timeout in milliseconds."
            }
          }
        },
        "defaults": {
          "endpoint": "https://example-sap-system.example.com:8443/sap/bc/srt/wsdl/flv_11/ver=0001/sap/example-service/example-binding",
          "requestTimeoutMs": 30000
        },
        "ai.quickdeploy.codegen/source": {
          "uri": "https://help.sap.com/docs/ABAP_PLATFORM_NEW/684cffda9cbc4187ad7dad790b03b983/4852347a08e672d0e10000000a42189c.html",
          "type": "http",
          "retrievedAt": "2026-07-09",
          "sourceVersion": "sap-abap-web-services-help-portal",
          "notes": [
            "Official SAP Help Portal ABAP Web Services documentation: https://help.sap.com/docs/ABAP_PLATFORM_NEW/684cffda9cbc4187ad7dad790b03b983/4852347a08e672d0e10000000a42189c.html",
            "SAP does not publish one fixed, global public WSDL; a concrete WSDL and endpoint are generated per SAP system/service via transaction SOAMANAGER against the Enterprise Services Repository (ESR).",
            "The committed manifest selects a read-only, representative subset of SAP's standard Enterprise Services (ES) content: the Sales Order Processing and Customer Replication scenarios (SalesOrderERPCreateRequest_sync_V1, CustomerERPByIDQueryResponse_In), which follow SAP's Global Data Type (GDT)-based ES naming convention.",
            "Exact interface availability is release- and configuration-dependent; config.defaults.endpoint models the shape of a per-tenant SOAMANAGER-generated endpoint, not a live production URL.",
            "SAP SOAP services typically authenticate via WS-Security UsernameToken or HTTP basic auth against the ABAP system user store; this manifest models it as basic auth env refs."
          ]
        },
        "ai.quickdeploy.codegen/policy": {
          "network": [
            "GET https://help.sap.com/docs/ABAP_PLATFORM_NEW/684cffda9cbc4187ad7dad790b03b983/4852347a08e672d0e10000000a42189c.html for source retrieval",
            "SOAP SalesOrderProcessing/SalesOrderERPCreateRequest_sync_V1 for selected upstream operation",
            "SOAP CustomerReplication/CustomerERPByIDQueryResponse_In for selected upstream operation"
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
            "from": "SOAP SalesOrderProcessing/SalesOrderERPCreateRequest_sync_V1",
            "name": "soap_salesorderprocessing_salesordererpcreaterequest_sync_v1",
            "deny": false
          },
          {
            "from": "SOAP CustomerReplication/CustomerERPByIDQueryResponse_In",
            "name": "soap_customerreplication_customererpbyidqueryresponse_in",
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
        "uri": "https://help.sap.com/docs/ABAP_PLATFORM_NEW/684cffda9cbc4187ad7dad790b03b983/4852347a08e672d0e10000000a42189c.html",
        "type": "http",
        "retrievedAt": "2026-07-09",
        "sourceVersion": "sap-abap-web-services-help-portal",
        "notes": [
          "Official SAP Help Portal ABAP Web Services documentation: https://help.sap.com/docs/ABAP_PLATFORM_NEW/684cffda9cbc4187ad7dad790b03b983/4852347a08e672d0e10000000a42189c.html",
          "SAP does not publish one fixed, global public WSDL; a concrete WSDL and endpoint are generated per SAP system/service via transaction SOAMANAGER against the Enterprise Services Repository (ESR).",
          "The committed manifest selects a read-only, representative subset of SAP's standard Enterprise Services (ES) content: the Sales Order Processing and Customer Replication scenarios (SalesOrderERPCreateRequest_sync_V1, CustomerERPByIDQueryResponse_In), which follow SAP's Global Data Type (GDT)-based ES naming convention.",
          "Exact interface availability is release- and configuration-dependent; config.defaults.endpoint models the shape of a per-tenant SOAMANAGER-generated endpoint, not a live production URL.",
          "SAP SOAP services typically authenticate via WS-Security UsernameToken or HTTP basic auth against the ABAP system user store; this manifest models it as basic auth env refs."
        ]
      },
      "ai.quickdeploy.codegen/policy": {
        "network": [
          "GET https://help.sap.com/docs/ABAP_PLATFORM_NEW/684cffda9cbc4187ad7dad790b03b983/4852347a08e672d0e10000000a42189c.html for source retrieval",
          "SOAP SalesOrderProcessing/SalesOrderERPCreateRequest_sync_V1 for selected upstream operation",
          "SOAP CustomerReplication/CustomerERPByIDQueryResponse_In for selected upstream operation"
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
        "from": "SOAP SalesOrderProcessing/SalesOrderERPCreateRequest_sync_V1",
        "name": "soap_salesorderprocessing_salesordererpcreaterequest_sync_v1",
        "deny": false
      },
      {
        "from": "SOAP CustomerReplication/CustomerERPByIDQueryResponse_In",
        "name": "soap_customerreplication_customererpbyidqueryresponse_in",
        "deny": false
      }
    ],
    "resources": [],
    "prompts": [],
    "authEnvVars": [
      "SAP_PASSWORD",
      "SAP_USERNAME"
    ],
    "serverEnvVars": [
      "SAP_PASSWORD",
      "SAP_USERNAME"
    ]
  },
});
