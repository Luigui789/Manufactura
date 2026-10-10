# Entorno de desarrollo: misma version de Node que GitHub Actions.
FROM node:22.16.0-bookworm-slim AS dependencies

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable

WORKDIR /app
RUN chown node:node /app
USER node

COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --chown=node:node backend/package.json ./backend/package.json
COPY --chown=node:node frontend/package.json ./frontend/package.json
RUN corepack install
RUN --mount=type=cache,id=ecosoap-pnpm,target=/pnpm/store,uid=1000,gid=1000 \
    pnpm install --frozen-lockfile --store-dir /pnpm/store

FROM dependencies AS backend-dev
USER root
# Nest Watch usa ps para terminar tambien los hijos del proceso anterior.
# Sin procps, la imagen slim deja la API anterior viva y falla con EADDRINUSE.
RUN apt-get update \
    && apt-get install -y --no-install-recommends procps \
    && rm -rf /var/lib/apt/lists/*
USER node
COPY --chown=node:node backend ./backend
WORKDIR /app/backend
# generate no conecta a la base; la URL de build es solo un marcador sin secretos.
RUN DATABASE_URL=postgresql://build@localhost:5432/build pnpm prisma:generate \
    && pnpm build
COPY --chown=node:node docker /app/docker
RUN chmod +x /app/docker/backend-entrypoint.sh
EXPOSE 3000
ENTRYPOINT ["/app/docker/backend-entrypoint.sh"]
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && exec pnpm start:dev"]

FROM dependencies AS frontend-dev
COPY --chown=node:node frontend ./frontend
WORKDIR /app/frontend
EXPOSE 5173
CMD ["pnpm", "dev", "--host", "0.0.0.0", "--port", "5173"]
