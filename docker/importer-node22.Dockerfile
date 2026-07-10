FROM node:22.18-bookworm-slim AS runtime

ARG PACKAGE_FILTER
ARG PACKAGE_ENTRYPOINT

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    NODE_ENV=production \
    PNPM_HOME=/pnpm \
    QDAI_PACKAGE_ENTRYPOINT=${PACKAGE_ENTRYPOINT} \
    QDAI_PACKAGE_FILTER=${PACKAGE_FILTER}
ENV PATH="${PNPM_HOME}:${PATH}"

WORKDIR /workspace

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages ./packages
COPY registry ./registry
COPY docker/importer-entrypoint.sh /usr/local/bin/importer-entrypoint

RUN chmod +x /usr/local/bin/importer-entrypoint
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
  pnpm install --frozen-lockfile --prod --filter "${QDAI_PACKAGE_FILTER}..."

ENTRYPOINT ["/usr/local/bin/importer-entrypoint"]
CMD ["--help"]
