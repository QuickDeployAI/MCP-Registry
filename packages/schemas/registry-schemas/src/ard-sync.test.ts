import { describe, expect, it } from "vitest";
import {
  ACP_AGENT_MANIFEST_MEDIA_TYPE,
  AI_SKILL_MD_MEDIA_TYPE,
  ARAZZO_MEDIA_TYPE,
  ARD_CATALOG_MEDIA_TYPE,
  ARD_REGISTRY_MEDIA_TYPE,
  ASYNCAPI_MEDIA_TYPE,
  CAPABILITY_TO_MEDIA_TYPE,
  GRPC_PROTO_MEDIA_TYPE,
  HAR_MEDIA_TYPE,
  JSON_RPC_MEDIA_TYPE,
  MEDIA_TYPE_TO_CAPABILITY_KINDS,
  OPENAPI_MEDIA_TYPE,
  OPENAPI_YAML_MEDIA_TYPE,
  OPENRPC_MEDIA_TYPE,
  POSTMAN_COLLECTION_MEDIA_TYPE,
  SOURCE_ARTIFACT_MEDIA_TYPES,
  SOURCE_MEDIA_TYPE_TO_IMPORTER_ENGINE,
  WSDL_MEDIA_TYPE,
} from "./ard";
import {
  ACP_AGENT_MANIFEST_MEDIA_TYPE as edgeAcpAgentManifestMediaType,
  AI_SKILL_MD_MEDIA_TYPE as edgeAiSkillMdMediaType,
  ARAZZO_MEDIA_TYPE as edgeArazzoMediaType,
  ARD_CAPABILITY_KINDS as edgeArdCapabilityKinds,
  ARD_CATALOG_MEDIA_TYPE as edgeArdCatalogMediaType,
  ARD_REGISTRY_MEDIA_TYPE as edgeArdRegistryMediaType,
  ASYNCAPI_MEDIA_TYPE as edgeAsyncapiMediaType,
  CAPABILITY_TO_MEDIA_TYPE as edgeCapabilityToMediaType,
  GRPC_PROTO_MEDIA_TYPE as edgeGrpcProtoMediaType,
  HAR_MEDIA_TYPE as edgeHarMediaType,
  JSON_RPC_MEDIA_TYPE as edgeJsonRpcMediaType,
  MEDIA_TYPE_TO_CAPABILITY_KINDS as edgeMediaTypeToCapabilityKinds,
  OPENAPI_MEDIA_TYPE as edgeOpenapiMediaType,
  OPENAPI_YAML_MEDIA_TYPE as edgeOpenapiYamlMediaType,
  OPENRPC_MEDIA_TYPE as edgeOpenrpcMediaType,
  POSTMAN_COLLECTION_MEDIA_TYPE as edgePostmanCollectionMediaType,
  SOURCE_ARTIFACT_MEDIA_TYPES as edgeSourceArtifactMediaTypes,
  SOURCE_MEDIA_TYPE_TO_IMPORTER_ENGINE as edgeSourceMediaTypeToImporterEngine,
  WSDL_MEDIA_TYPE as edgeWsdlMediaType,
} from "../edge/ard-core.ts";
import { ArdCapabilityKindSchema } from "./ard";

describe("ard.ts / ard-core.ts sync guard", () => {
  it("keeps media-type constants mirrored", () => {
    expect({
      ACP_AGENT_MANIFEST_MEDIA_TYPE,
      AI_SKILL_MD_MEDIA_TYPE,
      ARAZZO_MEDIA_TYPE,
      ARD_CATALOG_MEDIA_TYPE,
      ARD_REGISTRY_MEDIA_TYPE,
      ASYNCAPI_MEDIA_TYPE,
      GRPC_PROTO_MEDIA_TYPE,
      HAR_MEDIA_TYPE,
      JSON_RPC_MEDIA_TYPE,
      OPENAPI_MEDIA_TYPE,
      OPENAPI_YAML_MEDIA_TYPE,
      OPENRPC_MEDIA_TYPE,
      POSTMAN_COLLECTION_MEDIA_TYPE,
      WSDL_MEDIA_TYPE,
    }).toEqual({
      ACP_AGENT_MANIFEST_MEDIA_TYPE: edgeAcpAgentManifestMediaType,
      AI_SKILL_MD_MEDIA_TYPE: edgeAiSkillMdMediaType,
      ARAZZO_MEDIA_TYPE: edgeArazzoMediaType,
      ARD_CATALOG_MEDIA_TYPE: edgeArdCatalogMediaType,
      ARD_REGISTRY_MEDIA_TYPE: edgeArdRegistryMediaType,
      ASYNCAPI_MEDIA_TYPE: edgeAsyncapiMediaType,
      GRPC_PROTO_MEDIA_TYPE: edgeGrpcProtoMediaType,
      HAR_MEDIA_TYPE: edgeHarMediaType,
      JSON_RPC_MEDIA_TYPE: edgeJsonRpcMediaType,
      OPENAPI_MEDIA_TYPE: edgeOpenapiMediaType,
      OPENAPI_YAML_MEDIA_TYPE: edgeOpenapiYamlMediaType,
      OPENRPC_MEDIA_TYPE: edgeOpenrpcMediaType,
      POSTMAN_COLLECTION_MEDIA_TYPE: edgePostmanCollectionMediaType,
      WSDL_MEDIA_TYPE: edgeWsdlMediaType,
    });
  });

  it("keeps capability media types and source-artifact sets mirrored", () => {
    expect(CAPABILITY_TO_MEDIA_TYPE).toEqual(edgeCapabilityToMediaType);
    expect([...SOURCE_ARTIFACT_MEDIA_TYPES].sort()).toEqual(
      [...edgeSourceArtifactMediaTypes].sort(),
    );
  });

  it("keeps capability-kind and importer-engine dispatch maps mirrored", () => {
    expect(ArdCapabilityKindSchema.options).toEqual(edgeArdCapabilityKinds);
    expect(MEDIA_TYPE_TO_CAPABILITY_KINDS).toEqual(edgeMediaTypeToCapabilityKinds);
    expect(SOURCE_MEDIA_TYPE_TO_IMPORTER_ENGINE).toEqual(edgeSourceMediaTypeToImporterEngine);
  });
});
