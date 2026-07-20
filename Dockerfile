# ~/mcp-erpnext/Dockerfile

# ── Stage 1: build the UI viewers (needs Node/npm, not present in the Deno image) ──
FROM node:20-slim AS ui-builder
WORKDIR /app/src/ui
COPY src/ui/package.json src/ui/package-lock.json ./
RUN npm ci
COPY src/ui/ ./
RUN node build-all.mjs

# ── Stage 2: runtime ────────────────────────────────────────────────────────
FROM denoland/deno:2.3.3

WORKDIR /app
COPY . .
COPY --from=ui-builder /app/src/ui/dist ./src/ui/dist

# Pre-cache all dependencies so startup is fast
RUN deno cache --allow-import server.ts

EXPOSE 7654

CMD ["run", "--allow-all", "server.ts", "--http", "--port=7654"]
