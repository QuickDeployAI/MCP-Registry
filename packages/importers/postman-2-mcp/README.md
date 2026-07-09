# @quickdeployai/postman-2-mcp

Postman Collection v2.1 shim importer that converts collection requests into an
OpenAPI 3.1 contract for the shared OpenAPI-style MCP runtime surface.

```ts
import {
  convertPostmanCollectionToOpenApi,
  loadPostmanCollection,
} from "@quickdeployai/postman-2-mcp";

const collection = await loadPostmanCollection({
  collectionPath: "packages/importers/postman-2-mcp/fixtures/petstore-collection.json",
});

const result = convertPostmanCollectionToOpenApi({
  collection,
  variables: {
    petstoreApiToken: "${PETSTORE_API_TOKEN}",
    petstoreApiKey: "${PETSTORE_API_KEY}",
  },
});
```

The converter maps collection and request auth into env-backed OpenAPI security
schemes, resolves non-secret collection variables, converts `:path` segments to
OpenAPI `{path}` parameters, infers simple JSON request-body schemas, and fails
clearly when a required Postman variable is unresolved.
