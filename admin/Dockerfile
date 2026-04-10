FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
ENV NEXT_PUBLIC_GHOST_URL=https://ghost.videodj.studio
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3050
ENV PORT=3050
ENV HOSTNAME="0.0.0.0"
ENV DATABASE_URL=postgresql://ghost:gh0st_s3cure_p4ss@ghost-db:5432/videodj_studio

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3050/api/health || exit 1

CMD ["node", "server.js"]
