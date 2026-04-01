# -*- mode: Python -*-
# Tiltfile for Optio - Kubernetes-native development
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

# Namespace for all resources
namespace = "optio"

# Helm release name
release_name = "optio"

# Port mappings (match your existing setup)
api_node_port = 30400
web_node_port = 30310

# ──────────────────────────────────────────────────────────────────────────────
# API Image (dev)
# Uses Dockerfile.api.dev which runs tsx watch for auto-restart
# ──────────────────────────────────────────────────────────────────────────────
docker_build(
    "optio-api",
    ".",
    dockerfile="Dockerfile.api.dev",
    live_update=[
        sync("./apps/api/", "/app/apps/api/"),
        sync("./packages/", "/app/packages/"),
    ],
)

# ──────────────────────────────────────────────────────────────────────────────
# Web Image (dev)
# Uses Dockerfile.web.dev which runs next dev for HMR
# ──────────────────────────────────────────────────────────────────────────────
docker_build(
    "optio-web",
    ".",
    dockerfile="Dockerfile.web.dev",
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
# Generate a deterministic dev encryption key (only used locally)
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
    port_forwards=[api_node_port],
)

k8s_resource(
    release_name + "-web",
    port_forwards=[web_node_port],
)
