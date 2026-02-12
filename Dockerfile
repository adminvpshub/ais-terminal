# Stage 1: Dependencies
FROM node:20-slim AS base
WORKDIR /app
COPY package*.json ./

# Stage 2: Development / Build Dependencies
FROM base AS development
RUN npm ci
COPY . .
# We don't CMD here, we'll override in docker-compose.yml for dev

# Stage 3: Build the frontend
FROM development AS builder
RUN npm run build

# Stage 4: Production Runner
FROM base AS runner
RUN apt-get update && apt-get install -y curl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared && \
    chmod +x /usr/local/bin/cloudflared

RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY server.js ./

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

CMD ["node", "server.js"]
