FROM node:24-slim AS build

WORKDIR /app


RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY prisma ./prisma/
COPY prisma.config.ts ./

RUN npm ci
RUN npx prisma generate

COPY . .
RUN npm run build


FROM node:24-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY prisma ./prisma/
COPY prisma.config.ts ./


RUN npm ci
RUN npx prisma generate


COPY --from=build /app/dist ./dist


USER node

EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]