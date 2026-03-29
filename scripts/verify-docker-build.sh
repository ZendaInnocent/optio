#!/bin/bash
set -e

echo "=== Building Web Docker Image ==="
docker build -t optio-web:test -f Dockerfile.web .

echo "Docker build succeeded."