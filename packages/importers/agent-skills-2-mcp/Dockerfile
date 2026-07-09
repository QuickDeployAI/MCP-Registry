FROM node:22-slim AS builder
WORKDIR /app

COPY package.json ./
RUN npm install --production=false

COPY tsconfig.json ./
COPY src/ ./src/
RUN npx tsc

# Remove dev dependencies
RUN npm prune --production

FROM node:22-slim
WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

ENTRYPOINT ["node", "dist/index.js"]
