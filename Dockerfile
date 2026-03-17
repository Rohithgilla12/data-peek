# Stage 1: Install dependencies
FROM node:22-slim AS deps

RUN corepack enable && corepack prepare pnpm@10.22.0 --activate

WORKDIR /app

# Copy workspace config
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./

# Copy package.json files for all workspaces needed
COPY apps/server/package.json apps/server/package.json
COPY apps/webapp/package.json apps/webapp/package.json
COPY apps/desktop/package.json apps/desktop/package.json
COPY packages/shared/package.json packages/shared/package.json

# Copy server shims (referenced as file: deps in server/package.json)
COPY apps/server/shims/ apps/server/shims/

# Install all dependencies (including devDependencies for build)
RUN pnpm install --frozen-lockfile --ignore-scripts

# Stage 2: Build webapp
FROM node:22-slim AS webapp-builder

RUN corepack enable && corepack prepare pnpm@10.22.0 --activate

WORKDIR /app

# Copy all installed node_modules from deps stage
COPY --from=deps /app/ ./

# Copy source code
COPY packages/shared/ packages/shared/
COPY apps/webapp/ apps/webapp/

# Build webapp (produces apps/webapp/dist/)
RUN cd apps/webapp && npx vite build

# Stage 3: Production runtime
FROM node:22-slim AS production

RUN corepack enable && corepack prepare pnpm@10.22.0 --activate

WORKDIR /app

# Copy workspace config
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/server/package.json apps/server/package.json
COPY apps/desktop/package.json apps/desktop/package.json
COPY packages/shared/package.json packages/shared/package.json

# Copy server shims
COPY apps/server/shims/ apps/server/shims/

# Install all dependencies (tsx is a devDep needed at runtime for TS transpilation)
RUN pnpm install --frozen-lockfile --ignore-scripts

# Copy shared types (needed at runtime by tsx)
COPY packages/shared/ packages/shared/

# Copy server source (tsx runs from source, not compiled)
COPY apps/server/src/ apps/server/src/

# Copy desktop source (imported by server at runtime via createRequire)
COPY apps/desktop/src/main/ apps/desktop/src/main/

# Copy built webapp static files
COPY --from=webapp-builder /app/apps/webapp/dist/ apps/webapp/dist/

# Create data directory
RUN mkdir -p /app/data

# Environment defaults
ENV PORT=3100
ENV DATA_DIR=/app/data
ENV WEBAPP_DIR=/app/apps/webapp/dist
ENV NODE_ENV=production

EXPOSE 3100

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://localhost:3100/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

WORKDIR /app/apps/server

# Run server via tsx (needed for runtime TS transpilation of desktop imports)
CMD ["pnpm", "exec", "tsx", "--require", "./src/cjs-shims.cjs", "--import", "./src/register.ts", "src/index.ts"]
