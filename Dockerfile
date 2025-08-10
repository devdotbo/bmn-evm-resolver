## Unified multi-stage Dockerfile for Alice and Bob-Resolver services
# Base stage with shared setup and dependency caching
FROM denoland/deno:alpine-2.4.3 AS base

WORKDIR /app

# System deps for healthchecks and init
RUN apk add --no-cache tini curl jq

# Environment hardening and cache dir
ENV DENO_NO_UPDATE_CHECK=1 \
    DENO_NO_PROMPT=1 \
    NODE_ENV=production \
    DENO_DIR=/deno-dir \
    DENO_NODE_MODULES_DIR=none \
    DENO_NPM_BIN_DIR=/deno-dir/npm_bin

# Copy only files that affect dependency resolution first for better layer caching
COPY --chown=deno:deno deno.json deno.lock ./

# Copy source
COPY --chown=deno:deno . .

# Ensure no host node_modules forces Deno into manual node_modules mode
RUN rm -rf /app/node_modules

# Create runtime directories and set ownership
RUN mkdir -p /app/data/secrets /app/data/orders /app/data/logs /app/data/kv \
    /app/pending-orders /app/completed-orders ${DENO_DIR} ${DENO_NPM_BIN_DIR} && \
    chown -R deno:deno /app ${DENO_DIR}

# Pre-cache dependencies for both service entrypoints (lockfile enforced)
# Avoid lockfile strict mode due to npm graph; cache entrypoints without --frozen
RUN deno cache --unstable-kv alice-service.ts bob-resolver-service.ts src/indexer/ponder-client.ts

# Switch to non-root
USER deno

# Skip forcing npm cache to avoid node_modules symlink perms; rely on runtime cache

# --- Alice runtime image ---
FROM base AS alice
ENV DENO_KV_PATH=/app/data/kv/alice.db
EXPOSE 8001
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -sf http://localhost:8001/health || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["deno", "run", \
     "--allow-net", "--allow-env", "--allow-read", "--allow-write", \
     "--unstable-kv", \
     "alice-service.ts"]

# --- Bob-Resolver runtime image ---
FROM base AS bob
ENV SERVICE_MODE=bob-resolver \
    DENO_KV_PATH=/app/data/kv/bob.db
EXPOSE 8002
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -sf http://localhost:8002/health || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["deno", "run", \
     "--allow-net", "--allow-env", "--allow-read", "--allow-write", \
     "--unstable-kv", \
     "bob-resolver-service.ts"]