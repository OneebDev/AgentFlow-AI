# Build context: ./backend
FROM node:20-alpine
WORKDIR /app

COPY shared/package.json ./shared/package.json
COPY shared ./shared
RUN cd shared && npm install --omit=dev

COPY orchestrator/package.json ./package.json
RUN npm install --omit=dev

COPY orchestrator/src ./src

USER node
CMD ["node", "src/index.js"]
