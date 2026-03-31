# Builder image for custom image builds
# Contains Docker CLI and a build script that talks to DinD sidecar

ARG DOCKER_CLI_IMAGE=docker:cli
FROM ${DOCKER_CLI_IMAGE}

# Install any additional tools needed for builds (bash, jq, etc.)
RUN apk add --no-cache bash jq curl ca-certificates && update-ca-certificates

# Create scripts directory
RUN mkdir -p /scripts

# Build script that will be mounted with configuration via env
COPY images/builder-build.sh /scripts/build.sh
RUN chmod +x /scripts/build.sh

# Optional: health check to ensure Docker daemon is reachable
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD docker info || exit 1

WORKDIR /workspace

# Run the build script
ENTRYPOINT ["/scripts/build.sh"]
