# Build context: ./backend  (set in docker-compose.yml)
FROM node:20-alpine
WORKDIR /app

# ── Shared layer ─────────────────────────────────────────────────────────────
COPY shared/package.json ./shared/package.json
COPY shared ./shared
RUN cd shared && npm install --omit=dev

# ── Service deps ──────────────────────────────────────────────────────────────
COPY api-gateway/package.json ./package.json
RUN npm install --omit=dev

# ── Source ────────────────────────────────────────────────────────────────────
COPY api-gateway/src ./src

USER node
EXPOSE 3000
CMD ["node", "src/index.js"]
