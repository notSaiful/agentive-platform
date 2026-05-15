# syntax=docker/dockerfile:1
FROM node:20-slim

# Install openssl for Prisma
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy root package files
COPY package.json package-lock.json ./
COPY turbo.json ./
COPY tsconfig.base.json ./

# Copy workspace package.json files first (for layer caching)
COPY packages/shared/package.json ./packages/shared/
COPY packages/integrations/package.json ./packages/integrations/
COPY packages/engine/package.json ./packages/engine/

# Install dependencies
RUN npm ci

# Copy source code
COPY packages/shared ./packages/shared
COPY packages/integrations ./packages/integrations
COPY packages/engine ./packages/engine

# Generate Prisma client and build engine + deps
RUN npx prisma generate --schema=packages/engine/prisma/schema.prisma
RUN npx turbo build --filter=@agentive/engine

EXPOSE 3001

ENV NODE_ENV=production
ENV PORT=3001

CMD ["sh", "-c", "npx prisma migrate deploy --schema=packages/engine/prisma/schema.prisma && node packages/engine/dist/server.js"]
