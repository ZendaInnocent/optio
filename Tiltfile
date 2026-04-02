# -*- mode: Python -*-
# Tiltfile for Optio — Kubernetes-native development
#
# Usage:
#   tilt up          # Start development
#   tilt down        # Tear down
#   tilt ui          # Open dashboard (auto-opens on start)
#
# After tilt starts:
#   - Web UI:  http://localhost:30310  (auto port-forwarded)
#   - API:     http://localhost:30400  (auto port-forwarded)
#   - Edit any .ts/.tsx file → changes sync into pods in ~1-2s
#   - API auto-restarts via tsx watch, Web auto-refreshes via Next.js HMR

# ──────────────────────────────────────────────────────────────────────────────
# Configuration
# ──────────────────────────────────────────────────────────────────────────────
allow_k8s_contexts("docker-desktop")

namespace = "optio"
release_name = "optio"
api_node_port = 30400
web_node_port = 30310

# ──────────────────────────────────────────────────────────────────────────────
# Base Image — all workspace dependencies
# Only rebuilds when package.json or pnpm-lock.yaml changes.
# Both api and web dev images FROM this.
# ──────────────────────────────────────────────────────────────────────────────
docker_build(
    "optio-base",
    ".",
    dockerfile="Dockerfile.base",
    # Only watch files that affect dependency install
    only=[
        "package.json",
        "pnpm-lock.yaml",
        "pnpm-workspace.yaml",
        "turbo.json",
        "tsconfig.base.json",
        "apps/api/package.json",
        "apps/api/tsconfig.json",
        "apps/web/package.json",
        "apps/web/tsconfig.json",
        "packages/shared/package.json",
        "packages/shared/tsconfig.json",
        "packages/container-runtime/package.json",
        "packages/container-runtime/tsconfig.json",
        "packages/agent-adapters/package.json",
        "packages/agent-adapters/tsconfig.json",
        "packages/ticket-providers/package.json",
        "packages/ticket-providers/tsconfig.json",
        "packages/image-builder/package.json",
        "packages/image-builder/tsconfig.json",
    ],
)

# ──────────────────────────────────────────────────────────────────────────────
# API Image (dev) — FROM optio-base, runs tsx watch
# Source changes are synced via live_update (no rebuild needed).
# ──────────────────────────────────────────────────────────────────────────────
docker_build(
    "optio-api",
    ".",
    dockerfile="Dockerfile.api.dev",
    only=[
        "package.json",
        "pnpm-lock.yaml",
        "pnpm-workspace.yaml",
        "turbo.json",
        "tsconfig.base.json",
        "apps/api/",
        "packages/shared/",
        "packages/container-runtime/",
        "packages/agent-adapters/",
        "packages/ticket-providers/",
        "packages/image-builder/",
    ],
    live_update=[
        sync("./apps/api/", "/app/apps/api/"),
        sync("./packages/", "/app/packages/"),
    ],
)

# ──────────────────────────────────────────────────────────────────────────────
# Web Image (dev) — FROM optio-base, runs Next.js dev server
# Source changes are synced via live_update (no rebuild needed).
# ──────────────────────────────────────────────────────────────────────────────
docker_build(
    "optio-web",
    ".",
    dockerfile="Dockerfile.web.dev",
    only=[
        "package.json",
        "pnpm-lock.yaml",
        "pnpm-workspace.yaml",
        "turbo.json",
        "tsconfig.base.json",
        "apps/web/",
        "packages/shared/",
    ],
    live_update=[
        sync("./apps/web/", "/app/apps/web/"),
        sync("./packages/shared/", "/app/packages/shared/"),
    ],
)

# ──────────────────────────────────────────────────────────────────────────────
# Helm Deployment
# Uses helm template to generate manifests, then k8s_yaml to apply them.
# This avoids Windows path issues with Tilt's helm() function.
# ──────────────────────────────────────────────────────────────────────────────
dev_encryption_key = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

helm_values = [
    "--set", "api.image.pullPolicy=Never",
    "--set", "web.image.pullPolicy=Never",
    "--set", "agent.imagePullPolicy=Never",
    "--set", "api.service.type=NodePort",
    "--set", "api.service.nodePort=" + str(api_node_port),
    "--set", "web.service.type=NodePort",
    "--set", "web.service.nodePort=" + str(web_node_port),
    "--set", "auth.disabled=true",
    "--set", "encryption.key=" + dev_encryption_key,
    "--set", "postgresql.auth.password=optio_dev",
    # Dev resource overrides — Next.js dev compilation needs more CPU
    "--set", "api.resources.requests.cpu=250m",
    "--set", "api.resources.requests.memory=512Mi",
    "--set", "api.resources.limits.cpu=1",
    "--set", "api.resources.limits.memory=1Gi",
    "--set", "web.resources.requests.cpu=500m",
    "--set", "web.resources.requests.memory=1Gi",
    "--set", "web.resources.limits.cpu=2",
    "--set", "web.resources.limits.memory=2Gi",
]

helm_output = local(
    "helm template " + release_name + " helm/optio --namespace " + namespace + " --skip-tests " +
    " ".join(helm_values),
)

if helm_output:
    k8s_yaml(helm_output)

# ──────────────────────────────────────────────────────────────────────────────
# Port Forwarding
# ──────────────────────────────────────────────────────────────────────────────
k8s_resource(
    release_name + "-api",
    port_forwards=[str(api_node_port) + ":4000"],
    resource_deps=[release_name + "-postgres", release_name + "-redis"],
)

k8s_resource(
    release_name + "-web",
    port_forwards=[str(web_node_port) + ":3000"],
    resource_deps=[release_name + "-api"],
)
