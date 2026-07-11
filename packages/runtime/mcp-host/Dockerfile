# Build from the repository root:
#   docker build -f packages/runtime/mcp-host/Dockerfile -t ghcr.io/quickdeployai/mcp-host:dev .
#
# Publish tags should be promoted by digest:
#   ghcr.io/quickdeployai/mcp-host@sha256:<digest>

FROM node:22-slim AS build
RUN corepack enable
WORKDIR /repo

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json ./
COPY packages/schemas/registry-schemas ./packages/schemas/registry-schemas
COPY packages/core/importer-core ./packages/core/importer-core
COPY packages/core/proxy-core ./packages/core/proxy-core
COPY packages/importers/grpc-2-mcp ./packages/importers/grpc-2-mcp
COPY packages/importers/openapi-2-mcp ./packages/importers/openapi-2-mcp
COPY packages/importers/wsdl-2-mcp ./packages/importers/wsdl-2-mcp
COPY packages/runtime/mcp-host ./packages/runtime/mcp-host

# --ignore-scripts avoids wiring repo hooks inside the container build context.
RUN pnpm install --frozen-lockfile --ignore-scripts --filter "@quickdeployai/mcp-host..."
RUN echo "inject-workspace-packages=true" >> .npmrc
RUN pnpm --filter @quickdeployai/mcp-host deploy --prod --ignore-scripts /out

FROM node:22-slim AS runtime
ENV NODE_ENV=production \
    MCP_HOST_PORT=3000 \
    MCP_HOST_HOSTNAME=0.0.0.0
WORKDIR /app

COPY --from=build /out ./

USER node
EXPOSE 3000
ENTRYPOINT ["node", "--import", "tsx", "src/cli.mts"]
CMD ["run", "/projections/entry.ard.json", "--projection", "/projections/entry.projection.json", "--transport", "streamable-http", "--hostname", "0.0.0.0", "--port", "3000"]
