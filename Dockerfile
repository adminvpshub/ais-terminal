# Stage 1: Dependencies
FROM node:20-slim AS base
WORKDIR /app
COPY package*.json ./

# Stage 2: Development / Build Dependencies
FROM base AS development
RUN npm install
COPY . .
# We don't CMD here, we'll override in docker-compose.yml for dev

# Stage 3: Build the frontend
FROM development AS builder
RUN npm run build

# Stage 4: Production Runner
FROM base AS runner
RUN npm install --omit=dev
COPY --from=builder /app/dist ./dist
COPY server.js ./

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

CMD ["node", "--env-file=.env", "server.js"]
