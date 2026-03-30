import type { FastifyInstance } from "fastify";
import { checkRuntimeHealth } from "../services/container-service.js";
import { listSecrets, retrieveSecret, storeSecret } from "../services/secret-service.js";
import { isSubscriptionAvailable } from "../services/auth-service.js";

export async function setupRoutes(app: FastifyInstance) {
  // Check if the system has been set up (secrets exist)
  app.get("/api/setup/status", async (_req, reply) => {
    const secrets = await listSecrets();
    const secretNames = secrets.map((s) => s.name);

    // Check if setup was skipped
    const setupSkipped = secretNames.includes("SETUP_SKIPPED");
    if (setupSkipped) {
      reply.send({
        isSetUp: true,
        steps: {
          runtime: { done: true, label: "Container runtime" },
          githubToken: { done: true, label: "GitHub token" },
          anthropicKey: { done: true, label: "Anthropic API key" },
          openaiKey: { done: true, label: "OpenAI API key" },
          codexAppServer: { done: true, label: "Codex app-server" },
          anyAgentKey: { done: true, label: "At least one agent API key" },
        },
      });
      return;
    }

    const hasAnthropicKey = secretNames.includes("ANTHROPIC_API_KEY");
    const hasOpenAIKey = secretNames.includes("OPENAI_API_KEY");
    const hasGithubToken = secretNames.includes("GITHUB_TOKEN");

    // Check if using Max subscription or OAuth token mode
    let usingSubscription = false;
    let hasOauthToken = false;
    try {
      const authMode = await retrieveSecret("CLAUDE_AUTH_MODE").catch(() => null);
      if (authMode === "max-subscription") {
        usingSubscription = isSubscriptionAvailable();
      }
      if (authMode === "oauth-token") {
        hasOauthToken = secretNames.includes("CLAUDE_CODE_OAUTH_TOKEN");
      }
    } catch {}

    // Check if using Codex app-server mode (no API key needed)
    let hasCodexAppServer = false;
    try {
      const codexAuthMode = await retrieveSecret("CODEX_AUTH_MODE").catch(() => null);
      if (codexAuthMode === "app-server") {
        hasCodexAppServer = secretNames.includes("CODEX_APP_SERVER_URL");
      }
    } catch {}

    const hasAnyAgentKey =
      hasAnthropicKey || hasOpenAIKey || usingSubscription || hasOauthToken || hasCodexAppServer;

    let runtimeHealthy = false;
    try {
      runtimeHealthy = await checkRuntimeHealth();
    } catch {}

    const isSetUp = hasAnyAgentKey && hasGithubToken && runtimeHealthy;

    reply.send({
      isSetUp,
      steps: {
        runtime: { done: runtimeHealthy, label: "Container runtime" },
        githubToken: { done: hasGithubToken, label: "GitHub token" },
        anthropicKey: { done: hasAnthropicKey, label: "Anthropic API key" },
        openaiKey: { done: hasOpenAIKey, label: "OpenAI API key" },
        codexAppServer: { done: hasCodexAppServer, label: "Codex app-server" },
        anyAgentKey: { done: hasAnyAgentKey, label: "At least one agent API key" },
      },
    });
  });

  // Validate a GitHub token by trying to get the authenticated user
  app.post("/api/setup/validate/github-token", async (req, reply) => {
    const { token } = req.body as { token: string };
    if (!token) return reply.status(400).send({ valid: false, error: "Token is required" });

    try {
      const res = await fetch("https://api.github.com/user", {
        headers: { Authorization: `Bearer ${token}`, "User-Agent": "Optio" },
      });
      if (!res.ok) {
        return reply.send({ valid: false, error: `GitHub returned ${res.status}` });
      }
      const user = (await res.json()) as { login: string; name: string };
      reply.send({ valid: true, user: { login: user.login, name: user.name } });
    } catch (err) {
      reply.send({ valid: false, error: String(err) });
    }
  });

  // Validate an Anthropic API key
  app.post("/api/setup/validate/anthropic-key", async (req, reply) => {
    const { key } = req.body as { key: string };
    if (!key) return reply.status(400).send({ valid: false, error: "Key is required" });

    try {
      const res = await fetch("https://api.anthropic.com/v1/models", {
        headers: {
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
        },
      });
      if (res.ok) {
        reply.send({ valid: true });
      } else {
        const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        reply.send({ valid: false, error: body.error?.message ?? `API returned ${res.status}` });
      }
    } catch (err) {
      reply.send({ valid: false, error: String(err) });
    }
  });

  // Validate an OpenAI API key
  app.post("/api/setup/validate/openai-key", async (req, reply) => {
    const { key } = req.body as { key: string };
    if (!key) return reply.status(400).send({ valid: false, error: "Key is required" });

    try {
      const res = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (res.ok) {
        reply.send({ valid: true });
      } else {
        const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        reply.send({ valid: false, error: body.error?.message ?? `API returned ${res.status}` });
      }
    } catch (err) {
      reply.send({ valid: false, error: String(err) });
    }
  });

  // List recent repos for the authenticated user
  app.post("/api/setup/repos", async (req, reply) => {
    const { token } = req.body as { token: string };
    if (!token) return reply.status(400).send({ repos: [], error: "Token is required" });

    try {
      const headers = { Authorization: `Bearer ${token}`, "User-Agent": "Optio" };

      // Fetch repos sorted by most recently pushed
      const res = await fetch(
        "https://api.github.com/user/repos?sort=pushed&direction=desc&per_page=20&affiliation=owner,collaborator,organization_member",
        { headers },
      );
      if (!res.ok) {
        return reply.send({ repos: [], error: `GitHub returned ${res.status}` });
      }

      const data = (await res.json()) as Array<{
        full_name: string;
        html_url: string;
        clone_url: string;
        default_branch: string;
        private: boolean;
        description: string | null;
        language: string | null;
        pushed_at: string;
      }>;

      const repos = data.map((r) => ({
        fullName: r.full_name,
        cloneUrl: r.clone_url,
        htmlUrl: r.html_url,
        defaultBranch: r.default_branch,
        isPrivate: r.private,
        description: r.description,
        language: r.language,
        pushedAt: r.pushed_at,
      }));

      reply.send({ repos });
    } catch (err) {
      reply.send({ repos: [], error: String(err) });
    }
  });

  // Validate repo access (try to ls-remote)
  app.post("/api/setup/validate/repo", async (req, reply) => {
    const { repoUrl, token } = req.body as { repoUrl: string; token?: string };
    if (!repoUrl) return reply.status(400).send({ valid: false, error: "Repo URL is required" });

    try {
      // Use the GitHub API to check if the repo exists and is accessible
      const match = repoUrl.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
      if (!match) {
        return reply.send({ valid: false, error: "Could not parse GitHub repo from URL" });
      }
      const [, owner, repo] = match;
      const headers: Record<string, string> = { "User-Agent": "Optio" };
      const effectiveToken = token ?? (await retrieveSecret("GITHUB_TOKEN").catch(() => null));

      // First check if repo exists (without auth) to determine if private
      const unauthRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });
      if (unauthRes.status === 404) {
        // Repo not found at all (doesn't exist or was renamed)
        return reply.send({ valid: false, error: "Repository not found" });
      }

      if (unauthRes.status === 200) {
        const data = (await unauthRes.json()) as {
          full_name: string;
          default_branch: string;
          private: boolean;
        };

        // Public repo - accessible without token
        if (!data.private) {
          return reply.send({
            valid: true,
            repo: {
              fullName: data.full_name,
              defaultBranch: data.default_branch,
              isPrivate: data.private,
            },
          });
        }

        // Private repo - need token
        if (!effectiveToken) {
          return reply.send({
            valid: false,
            error: "GitHub token required for private repositories",
            needsGithubToken: true,
          });
        }

        // Verify token works for private repo
        headers["Authorization"] = `Bearer ${effectiveToken}`;
        const authRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });
        if (authRes.ok) {
          const authData = (await authRes.json()) as {
            full_name: string;
            default_branch: string;
            private: boolean;
          };
          return reply.send({
            valid: true,
            repo: {
              fullName: authData.full_name,
              defaultBranch: authData.default_branch,
              isPrivate: authData.private,
            },
          });
        } else {
          return reply.send({
            valid: false,
            error: "GitHub token does not have access to this repository",
          });
        }
      }

      reply.send({ valid: false, error: `Repository check failed (${unauthRes.status})` });
    } catch (err) {
      reply.send({ valid: false, error: String(err) });
    }
  });

  // Skip setup - marks system as configured without storing credentials
  app.post("/api/setup/skip", async (_req, reply) => {
    try {
      await storeSecret("SETUP_SKIPPED", "true", "global");
      reply.send({ skipped: true });
    } catch (err) {
      reply.status(500).send({ skipped: false, error: String(err) });
    }
  });
}
