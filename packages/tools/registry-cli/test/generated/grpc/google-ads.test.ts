import { describeGeneratedMcpManifest } from "../generated-test-helpers";

describeGeneratedMcpManifest({
  family: "grpc",
  provider: "google-ads",
  manifestPath: "registry/google-ads/grpc.mcp.json",
  manifest: {
    "apiVersion": "quickdeploy.ai/v1",
    "kind": "McpManifest",
    "metadata": {
      "name": "ai.quickdeploy/google-ads",
      "version": "0.1.0",
      "title": "Google Ads",
      "description": "Generated grpc-2-mcp MCP manifest for the Google Ads API GoogleAdsFieldService.",
      "labels": [
        "ads",
        "generated",
        "google",
        "google-ads",
        "grpc"
      ]
    },
    "spec": {
      "importer": {
        "engine": "grpc-2-mcp",
        "versionRange": "^0.1.0"
      },
      "source": {
        "type": "http",
        "uri": "https://raw.githubusercontent.com/googleapis/googleapis/master/google/ads/googleads/v22/services/google_ads_field_service.proto",
        "digest": "sha256:fa1cfc42603ee80d88f144e519c371f16156be6248237ce4d81f2223701560af"
      },
      "select": {
        "requests": [],
        "grpcMethods": [
          {
            "service": "google.ads.googleads.v22.services.GoogleAdsFieldService",
            "method": "GetGoogleAdsField"
          },
          {
            "service": "google.ads.googleads.v22.services.GoogleAdsFieldService",
            "method": "SearchGoogleAdsFields"
          }
        ],
        "pythonFunctions": [],
        "skills": [],
        "knowledgeSources": [],
        "corpusGlobs": []
      },
      "auth": [
        {
          "type": "oauth2",
          "valueFrom": {
            "env": "GOOGLE_ADS_ACCESS_TOKEN"
          }
        },
        {
          "type": "api-key",
          "in": "header",
          "name": "developer-token",
          "valueFrom": {
            "env": "GOOGLE_ADS_DEVELOPER_TOKEN"
          }
        }
      ],
      "config": {
        "schema": {
          "type": "object",
          "properties": {
            "endpoint": {
              "type": "string",
              "description": "Google Ads API gRPC endpoint."
            },
            "tls": {
              "type": "boolean",
              "description": "Whether the gRPC channel uses TLS."
            }
          },
          "required": [
            "endpoint"
          ]
        },
        "defaults": {
          "endpoint": "googleads.googleapis.com:443",
          "tls": true
        },
        "ai.quickdeploy.codegen/source": {
          "uri": "https://raw.githubusercontent.com/googleapis/googleapis/master/google/ads/googleads/v22/services/google_ads_field_service.proto",
          "type": "http",
          "digest": "sha256:fa1cfc42603ee80d88f144e519c371f16156be6248237ce4d81f2223701560af",
          "retrievedAt": "2026-07-09",
          "sourceVersion": "googleapis/googleapis@master:google/ads/googleads/v22 (GoogleAdsFieldService)",
          "notes": [
            "Official Google Ads API proto source repository: https://github.com/googleapis/googleapis/tree/master/google/ads/googleads (Google Ads has no separate protos-only repository; googleapis/googleapis is the canonical, Google-maintained source).",
            "Scoped to GoogleAdsFieldService (GetGoogleAdsField, SearchGoogleAdsFields) and its direct dependencies rather than the full Google Ads API, which has a very large interdependent proto graph across hundreds of files.",
            "Pinned files (all retrieved 2026-07-09 from the master branch, API version v22):",
            "- google/ads/googleads/v22/services/google_ads_field_service.proto sha256:fa1cfc42603ee80d88f144e519c371f16156be6248237ce4d81f2223701560af",
            "- google/ads/googleads/v22/resources/google_ads_field.proto sha256:523fd032c95f9437ff75a2f606fb9bf614a047e3f46cacc78d21ffc901cdfed7",
            "- google/ads/googleads/v22/enums/google_ads_field_category.proto sha256:141bce3d068eed3583993b700e732d213f9b4072a7e681a57c0a8c219889ba95",
            "- google/ads/googleads/v22/enums/google_ads_field_data_type.proto sha256:53295ba48374c53909f28ebe960d4a4f584040786c0d87d9c94ef62a81815197",
            "No protoc/buf CLI is available in this sandbox, so the FileDescriptorSet used for codegen was hand-encoded (via @bufbuild/protobuf create/toBinary, the same primitive this repo's grpc-2-mcp package uses for its own test fixtures) to exactly mirror the real field names, numbers, and types from the pinned official .proto sources above.",
            "The google.api.* REST-transcoding extension options (field_behavior, resource, resource_reference, http) present in the official source were intentionally omitted from the encoded descriptor: they are not read by grpc-2-mcp's descriptor parser (packages/importers/grpc-2-mcp/src/descriptor.ts and schema.ts only consume services/methods/messages/fields/enums), and including them would require additionally vendoring the google/api/*.proto extension definitions with no effect on the generated MCP surface.",
            "gRPC endpoint per the official proto: googleads.googleapis.com (default_host option in the source)."
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
            "from": "google.ads.googleads.v22.services.GoogleAdsFieldService/GetGoogleAdsField",
            "name": "google_ads_googleads_v22_services_googleadsfieldservice_getgoogleadsfield",
            "deny": false
          },
          {
            "from": "google.ads.googleads.v22.services.GoogleAdsFieldService/SearchGoogleAdsFields",
            "name": "google_ads_googleads_v22_services_googleadsfieldservice_searchgoogleadsfields",
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
        "uri": "https://raw.githubusercontent.com/googleapis/googleapis/master/google/ads/googleads/v22/services/google_ads_field_service.proto",
        "type": "http",
        "digest": "sha256:fa1cfc42603ee80d88f144e519c371f16156be6248237ce4d81f2223701560af",
        "retrievedAt": "2026-07-09",
        "sourceVersion": "googleapis/googleapis@master:google/ads/googleads/v22 (GoogleAdsFieldService)",
        "notes": [
          "Official Google Ads API proto source repository: https://github.com/googleapis/googleapis/tree/master/google/ads/googleads (Google Ads has no separate protos-only repository; googleapis/googleapis is the canonical, Google-maintained source).",
          "Scoped to GoogleAdsFieldService (GetGoogleAdsField, SearchGoogleAdsFields) and its direct dependencies rather than the full Google Ads API, which has a very large interdependent proto graph across hundreds of files.",
          "Pinned files (all retrieved 2026-07-09 from the master branch, API version v22):",
          "- google/ads/googleads/v22/services/google_ads_field_service.proto sha256:fa1cfc42603ee80d88f144e519c371f16156be6248237ce4d81f2223701560af",
          "- google/ads/googleads/v22/resources/google_ads_field.proto sha256:523fd032c95f9437ff75a2f606fb9bf614a047e3f46cacc78d21ffc901cdfed7",
          "- google/ads/googleads/v22/enums/google_ads_field_category.proto sha256:141bce3d068eed3583993b700e732d213f9b4072a7e681a57c0a8c219889ba95",
          "- google/ads/googleads/v22/enums/google_ads_field_data_type.proto sha256:53295ba48374c53909f28ebe960d4a4f584040786c0d87d9c94ef62a81815197",
          "No protoc/buf CLI is available in this sandbox, so the FileDescriptorSet used for codegen was hand-encoded (via @bufbuild/protobuf create/toBinary, the same primitive this repo's grpc-2-mcp package uses for its own test fixtures) to exactly mirror the real field names, numbers, and types from the pinned official .proto sources above.",
          "The google.api.* REST-transcoding extension options (field_behavior, resource, resource_reference, http) present in the official source were intentionally omitted from the encoded descriptor: they are not read by grpc-2-mcp's descriptor parser (packages/importers/grpc-2-mcp/src/descriptor.ts and schema.ts only consume services/methods/messages/fields/enums), and including them would require additionally vendoring the google/api/*.proto extension definitions with no effect on the generated MCP surface.",
          "gRPC endpoint per the official proto: googleads.googleapis.com (default_host option in the source)."
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
        "from": "google.ads.googleads.v22.services.GoogleAdsFieldService/GetGoogleAdsField",
        "name": "google_ads_googleads_v22_services_googleadsfieldservice_getgoogleadsfield",
        "deny": false
      },
      {
        "from": "google.ads.googleads.v22.services.GoogleAdsFieldService/SearchGoogleAdsFields",
        "name": "google_ads_googleads_v22_services_googleadsfieldservice_searchgoogleadsfields",
        "deny": false
      }
    ],
    "resources": [],
    "prompts": [],
    "authEnvVars": [
      "GOOGLE_ADS_ACCESS_TOKEN",
      "GOOGLE_ADS_DEVELOPER_TOKEN"
    ],
    "serverEnvVars": [
      "GOOGLE_ADS_ACCESS_TOKEN",
      "GOOGLE_ADS_DEVELOPER_TOKEN",
      "QD_MANIFEST_ENDPOINT"
    ]
  },
});
