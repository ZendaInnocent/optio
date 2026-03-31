#!/bin/bash
set -euo pipefail

# Builder container entrypoint
# Expects env: DOCKER_HOST, REGISTRY_URL, IMAGE_TAG
# Dockerfile will be available at /dockerfile/Dockerfile (mounted from ConfigMap)

echo "=== Starting custom image build ==="
echo "DOCKER_HOST=${DOCKER_HOST:-not set}"
echo "REGISTRY_URL=${REGISTRY_URL:-not set}"
echo "IMAGE_TAG=${IMAGE_TAG:-not set}"

# Wait for Docker daemon to be ready
echo "Waiting for Docker daemon..."
for i in {1..30}; do
  if docker info > /dev/null 2>&1; then
    echo "Docker daemon is ready"
    break
  fi
  sleep 2
  echo "Waiting... ($i/30)"
done

if ! docker info > /dev/null 2>&1; then
  echo "ERROR: Docker daemon not ready after 60 seconds"
  exit 1
fi

# Verify Dockerfile exists
if [ ! -f /dockerfile/Dockerfile ]; then
  echo "ERROR: Dockerfile not found at /dockerfile/Dockerfile"
  ls -la /dockerfile
  exit 1
fi

# Build the image
echo "=== Building image ${IMAGE_TAG} ==="
set -x
docker build -t "${IMAGE_TAG}" -f /dockerfile/Dockerfile .
set +x

if [ $? -ne 0 ]; then
  echo "ERROR: Docker build failed"
  exit 1
fi

echo "=== Image built successfully: ${IMAGE_TAG} ==="

# Push the image to the registry
echo "=== Pushing image to ${REGISTRY_URL} ==="
set -x
docker push "${IMAGE_TAG}"
set +x

if [ $? -ne 0 ]; then
  echo "ERROR: Docker push failed"
  exit 1
fi

echo "=== Image pushed successfully: ${IMAGE_TAG} ==="
echo "Build complete."
