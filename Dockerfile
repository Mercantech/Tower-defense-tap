FROM node:20-alpine

WORKDIR /app

# Bust layer cache when UI/content changes (Dokploy often reuses stale COPY cache)
ARG CACHE_BUST=81eca18
RUN echo "cache_bust=$CACHE_BUST"

COPY server/package*.json ./server/
RUN cd server && npm ci --omit=dev

COPY server/ ./server/
COPY public/ ./public/

WORKDIR /app/server

EXPOSE 8080

CMD ["node", "server.js"]
