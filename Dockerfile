FROM node:20-alpine AS builder

# Install ffmpeg for video support
RUN apk add --no-cache ffmpeg python3 make g++

WORKDIR /app
COPY package*.json ./
RUN npm ci --production=false
COPY . .
RUN npm run build

# ── Runtime image ─────────────────────────────────────────────────────────────
FROM node:20-alpine

RUN apk add --no-cache ffmpeg

WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/public ./public

# Create output directory
RUN mkdir -p /data/testcase-output

ENV NODE_ENV=production
ENV PORT=3456
ENV OUTPUT_DIR=/data/testcase-output
ENV AI_PROVIDER=anthropic

EXPOSE 3456

HEALTHCHECK --interval=30s --timeout=5s \
  CMD wget -qO- http://localhost:3456/api/health || exit 1

CMD ["node", "dist/index.js", "--standalone"]
