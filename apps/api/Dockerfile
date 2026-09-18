# PlaySlot API image.
#
# Built from the REPO ROOT, because the API depends on the packages/* workspaces:
#   docker build -f apps/api/Dockerfile .
# Railway does this automatically when the service's root directory is the repo
# root and this file is set as the Dockerfile path.
FROM node:20-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
# Prisma's query engine needs openssl on Debian slim.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /repo

# ── build ────────────────────────────────────────────────────────────────────
FROM base AS build
# Copy manifests first so the install layer caches until dependencies change.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.base.json .npmrc ./
COPY apps/api/package.json apps/api/
COPY packages/config/package.json packages/config/
COPY packages/contracts/package.json packages/contracts/
COPY packages/db/package.json packages/db/
COPY packages/domain/package.json packages/domain/
RUN pnpm install --frozen-lockfile

COPY . .
# `...` builds @playslot/api *and its workspace dependencies*, in order. The db
# package's own build script runs `prisma generate`, so the client is generated
# here rather than as a separate step that could drift from the schema.
RUN pnpm --filter @playslot/api... build

# ── runtime ──────────────────────────────────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production
# The whole built workspace ships as-is. It is a larger image than a pruned
# deploy, but it keeps the pnpm symlink layout intact — which is what makes
# @playslot/* imports and the generated Prisma client resolve at runtime.
COPY --from=build /repo ./

USER node
# PORT is injected by the platform; main.ts prefers it over API_BASE_URL.
EXPOSE 3001
CMD ["node", "apps/api/dist/main.js"]
