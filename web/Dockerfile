FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY . .

ENV NEXT_PUBLIC_BASE_URL=https://app.videodj.studio
ENV NEXT_PUBLIC_GHOST_URL=https://ghost.videodj.studio
ENV NEXT_PUBLIC_GHOST_API_KEY=gh0st_d00609ea286585c3ebf7d299c4484489
ENV NEXT_PUBLIC_MINIO_ENABLED=true

RUN npm run build

# Production — standalone output, minimal image
FROM node:20-alpine AS runner
WORKDIR /app

# FFmpeg for RTMP live streaming to Twitch/YouTube
RUN apk add --no-cache ffmpeg

ENV NODE_ENV=production
ENV PORT=3030
ENV HOSTNAME=0.0.0.0
ENV RESEND_API_KEY=re_cihcJYcX_KZ81XGLfvZbk3TNypAx5QPKg
ENV DATABASE_URL=postgresql://ghost:gh0st_s3cure_p4ss@ghost-db:5432/videodj_studio
ENV MINIO_ENDPOINT=https://s3.videodj.studio
ENV MINIO_ACCESS_KEY=videodj_admin
ENV MINIO_SECRET_KEY=v1de0dj_m1n10_s3cure!
ENV MINIO_BUCKET=videodj-files

# Agent configuration — override via Dokploy environment variables
ENV AGENT_MODE=apikey
ENV AGENT_PROVIDER=anthropic
ENV AGENT_API_KEY=
ENV AGENT_ENDPOINT=
ENV AGENT_MODEL=claude-sonnet-4-20250514

# Standalone includes all needed node_modules — no npm install needed
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3030
CMD ["node", "server.js"]
