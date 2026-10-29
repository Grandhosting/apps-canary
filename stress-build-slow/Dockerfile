# Build that outlasts the 20-minute build limit (BUILD_TIMEOUT_SECONDS 1200). SLOW_SECONDS can be set as a build
# variable to make it shorter (for example to hold the build slot while other builds queue).
FROM node:22.23.2-bookworm-slim@sha256:48e4b67d85f87bd551df43704e24d252f56cc5f8e9718841aace50f19948f0f9
ARG SLOW_SECONDS=1500
RUN for i in $(seq 1 $((SLOW_SECONDS / 30))); do echo "still building $((i * 30)) s"; sleep 30; done
COPY server.js /app/server.js
CMD ["node","/app/server.js"]
