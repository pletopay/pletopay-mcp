# syntax=docker/dockerfile:1.7
# The hosted (Streamable HTTP) Pletopay MCP server.
#
#   docker build -t pletopay-mcp .
# Run it with the public hostname it serves (DNS rebinding protection) and the proxy hop count:
#   docker run -p 3010:3010 -e MCP_ALLOWED_HOSTS=mcp.pletopay.com -e MCP_TRUST_PROXY_HOPS=1 pletopay-mcp
# Never give the container a PLETOPAY_SECRET_KEY: over HTTP every request brings its own key.

# node:26-alpine, pinned by (multi-arch index) digest, the same base as the API image.
FROM node:26-alpine@sha256:40cd011b55415bc894e45b02fdd5a5dfde056921b7d23a64c74f80497af48797 AS base
# Node 25+ no longer bundles corepack: install a pinned one (it then provides packageManager's pnpm).
RUN npm install -g corepack@0.36.0 && corepack enable
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0

FROM base AS build
WORKDIR /src/pletopay-mcp
COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile
COPY . ./
RUN pnpm build && pnpm prune --prod --ignore-scripts

FROM node:26-alpine@sha256:40cd011b55415bc894e45b02fdd5a5dfde056921b7d23a64c74f80497af48797 AS runtime
ENV NODE_ENV=production PORT=3010
# npm/npx are unused at runtime and carry most of the image's known CVEs: remove them.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx \
  && addgroup -S app && adduser -S app -G app
WORKDIR /app
COPY --from=build --chown=app:app /src/pletopay-mcp/node_modules ./node_modules
COPY --from=build --chown=app:app /src/pletopay-mcp/dist ./dist
COPY --from=build --chown=app:app /src/pletopay-mcp/spec ./spec
COPY --from=build --chown=app:app /src/pletopay-mcp/package.json ./package.json
USER app
EXPOSE 3010
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3010)+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "dist/bin.js", "--transport", "http", "--host", "0.0.0.0"]
