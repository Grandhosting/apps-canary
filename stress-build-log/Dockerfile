# Build that prints about 60 MB of log (600 000 numbered lines of ~100 bytes). The stored log keeps the first 1 MiB
# and the last 4 MiB: the first and last line numbers must both be in it, a middle one must not.
FROM node:22.23.2-bookworm-slim@sha256:48e4b67d85f87bd551df43704e24d252f56cc5f8e9718841aace50f19948f0f9
RUN node -e 'const p="x".repeat(80);for(let i=1;i<=600000;i++)console.log("LOGLINE "+String(i).padStart(6,"0")+" "+p)'
COPY server.js /app/server.js
CMD ["node","/app/server.js"]
