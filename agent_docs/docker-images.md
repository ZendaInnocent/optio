# Docker Image Creation Guide

## Project Docker Images

Location: `images/` directory

| Image                | Purpose                                                    |
| -------------------- | ---------------------------------------------------------- |
| `base.Dockerfile`    | Base image with git, gh, node, pnpm, Claude Code, OpenCode |
| `builder.Dockerfile` | Build environment for compiling code                       |
| `node.Dockerfile`    | Node.js runtime                                            |
| `python.Dockerfile`  | Python runtime                                             |
| `go.Dockerfile`      | Go runtime                                                 |
| `rust.Dockerfile`    | Rust runtime                                               |
| `dind.Dockerfile`    | Docker-in-Docker for CI                                    |
| `full.Dockerfile`    | Complete dev environment                                   |

## Best Practices

### Multi-Stage Builds

Use a builder stage for compilation, then copy artifacts to a minimal runtime image:

```dockerfile
FROM ubuntu:24.04 AS builder
RUN apt-get install ... && compile stuff

FROM ubuntu:24.04
COPY --from=builder /app/binary /usr/local/bin/
```

### BuildKit Cache Mounts

Use `--mount=type=cache` for package managers to speed up rebuilds:

```dockerfile
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y package
```

### Pin Base Images by Digest

Use immutable digests for reproducibility:

```dockerfile
FROM ubuntu@sha256:8a37d68f4f73ebf3d4efafbcf66379bf3728902803803680f805a8dd8c9b0a8
```

### Minimal Packages

Always use `--no-install-recommends` with apt to avoid unnecessary packages:

```dockerfile
RUN apt-get install -y --no-install-recommends git curl jq
```

### Layer Ordering

Put infrequently changing layers first (base packages, system deps), changing layers last (application code):

1. Base image
2. System dependencies
3. Language runtime
4. Build tools
5. Application code

### Minimal Layers

Combine related RUN commands to reduce layer count:

```dockerfile
# Bad - multiple layers
RUN apt-get update
RUN apt-get install git
RUN apt-get install curl

# Good - single layer
RUN apt-get update && apt-get install -y git curl
```

## Building Images

```bash
# Build with BuildKit
docker build -f images/base.Dockerfile -t optio/base:latest .

# Build with inline cache for faster rebuilds
docker build --cache-from=optio/base:previous -f images/base.Dockerfile -t optio/base:latest .
```

## Syntax Directive

Always include BuildKit syntax directive at the top:

```dockerfile
# syntax=docker/dockerfile:1
```
