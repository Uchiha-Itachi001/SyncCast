# Production Multi-Stage Dockerfile for SyncCast on Render / Cloud
FROM node:20-bookworm-slim AS base

# Install ffmpeg and ca-certificates for audio processing
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    ca-certificates \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy root and package manifests for caching
COPY package*.json ./
COPY server/package*.json ./server/
COPY client/package*.json ./client/

# Install dependencies across workspaces
RUN npm install

# Copy application source
COPY . .

# Build Vite client production bundle
RUN npm --prefix client run build

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

CMD ["npm", "--prefix", "server", "start"]
