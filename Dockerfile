# ~/mcp-erpnext/Dockerfile
FROM denoland/deno:2.3.3

WORKDIR /app
COPY . .

# Pre-cache all dependencies so startup is fast
RUN deno cache --allow-import server.ts

EXPOSE 7654

CMD ["run", "--allow-all", "server.ts", "--http", "--port=7654"]
