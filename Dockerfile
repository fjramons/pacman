FROM node:22-bookworm-slim AS deps

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci --omit=dev

FROM node:22-bookworm-slim AS runtime

WORKDIR /usr/src/app

COPY --from=deps /usr/src/app/node_modules ./node_modules
COPY --chown=node:node . .

ENV NODE_ENV=production \
    PORT=8080

USER node

EXPOSE 8080

CMD ["node", "."]
