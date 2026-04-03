# syntax=docker/dockerfile:1
# BuildKit for advanced features
# Use specific Ubuntu release with digest for reproducibility
FROM ubuntu@sha256:8a37d68f4f73ebf3d4efafbcf66379bf3728902803803680f805a8dd8c9b0a8 AS builder

ENV DEBIAN_FRONTEND=noninteractive

# Install system dependencies in single layer with BuildKit cache mounts
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
        git curl wget jq unzip ca-certificates gnupg openssh-client python3 \
    && rm -rf /var/lib/apt/lists/*

# GitHub CLI - single layer with cache mounts
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    install -d -m 0755 /etc/apt/keyrings \
    && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
        | gpg --dearmor -o /etc/apt/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
        > /etc/apt/sources.list.d/github-cli.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends gh \
    && rm -rf /var/lib/apt/lists/*

# Node.js 22 - single layer with BuildKit cache
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# pnpm and global tools with BuildKit cache mount
RUN --mount=type=cache,target=/root/.npm \
    corepack enable && corepack prepare pnpm@10 --activate \
    && npm install -g @anthropic-ai/claude-code opencode-ai \
    && npm cache clean --force

# Final stage - minimal runtime image
FROM ubuntu@sha256:8a37d68f4f73ebf3d4efafbcf66379bf3728902803803680f805a8dd8c9b0a8

ENV DEBIAN_FRONTEND=noninteractive

# Copy all required binaries and libraries from builder in single layer
COPY --from=builder /usr/bin/git /usr/bin/curl /usr/bin/wget /usr/bin/jq /usr/bin/unzip \
                     /usr/bin/python3 /usr/bin/corepack /usr/bin/node /usr/bin/npm \
                     /usr/bin/gh /usr/bin/ssh* /usr/bin/gpg* \
                     /usr/bin/
COPY --from=builder /usr/local/bin/ /usr/local/bin/
COPY --from=builder /usr/local/lib/node_modules/ /usr/local/lib/node_modules/
COPY --from=builder /etc/apt/keyrings/ /etc/apt/keyrings/
COPY --from=builder /etc/apt/sources.list.d/ /etc/apt/sources.list.d/
COPY --from=builder /root/.npm/_npx/ /root/.npm/_npx/
COPY --from=builder /root/.cache/ /root/.cache/

# Create workspace and copy scripts
WORKDIR /workspace
RUN mkdir -p /opt/optio
COPY scripts/agent-entrypoint.sh /opt/optio/entrypoint.sh
COPY scripts/repo-init.sh /opt/optio/repo-init.sh
RUN chmod +x /opt/optio/entrypoint.sh /opt/optio/repo-init.sh

# Create non-root user
RUN useradd -m -s /bin/bash agent \
    && chown -R agent:agent /workspace \
    && chown -R agent:agent /root/.npm \
    && chown -R agent:agent /root/.cache
USER agent

ENTRYPOINT ["/opt/optio/repo-init.sh"]