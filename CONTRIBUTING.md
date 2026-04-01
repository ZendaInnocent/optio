# Contributing to Optio

Thanks for your interest in contributing! This guide will help you get started.

## Development Setup

### Prerequisites

- **Node.js 22+**
- **pnpm 10+** (`npm install -g pnpm`)
- **Docker Desktop** with Kubernetes enabled
- **Helm** - see [Helm installation docs](https://helm.sh/docs/intro/install/)
- **Tilt** — see [Tilt installation docs](https://docs.tilt.dev/install.html)

### Quick Start

```bash
cd optio
tilt up
```

Tilt builds dev images, deploys everything to your local Kubernetes cluster, and opens a dashboard at http://localhost:10350.

```
Tilt Dashboard ... http://localhost:10350
Web UI ........... http://localhost:30310
API .............. http://localhost:30400
```

**How development works:**

- Edit any `.ts`/`.tsx` file → changes sync into pods in ~1-2 seconds
- API auto-restarts via `tsx watch`, Web auto-refreshes via Next.js HMR
- All infrastructure (Postgres, Redis) runs in the same cluster
- Open the Tilt UI for live logs, resource status, and one-click port-forwards

### Legacy: Manual Dev Mode

If you prefer running dev servers locally (without Tilt):

```bash
pnpm install
./scripts/setup-local.sh  # Start K8s infrastructure only
pnpm dev                  # Start API + Web with hot reload
```

The API runs on http://localhost:4000 and the web UI on http://localhost:3100.

## Project Structure

```
apps/api/     Fastify API server + BullMQ workers
apps/web/     Next.js web UI
packages/     Shared libraries (types, runtime, adapters, providers)
helm/         Production Helm charts
images/       Agent container Dockerfiles
k8s/          Local dev K8s manifests
```

## Development Workflow

### Commands

```bash
tilt up               # Start full dev environment (recommended)
pnpm dev              # Start API + Web with hot reload (manual mode)
pnpm turbo typecheck  # Typecheck all packages
pnpm turbo test       # Run tests
pnpm format           # Format with Prettier
pnpm lint             # Lint with ESLint
```

### Database Changes

```bash
# Edit apps/api/src/db/schema.ts, then:
cd apps/api && npx drizzle-kit generate  # Generate migration
cd apps/api && npx drizzle-kit migrate   # Apply migration
```

### Adding a New API Route

1. Create the route handler in `apps/api/src/routes/`
2. Register it in `apps/api/src/server.ts`
3. Add the API client method in `apps/web/src/lib/api-client.ts`

## Commit Conventions

We use [Conventional Commits](https://www.conventionalcommits.org/). Commit messages are enforced by commitlint.

```
feat: add new feature
fix: fix a bug
docs: documentation changes
style: formatting, no code change
refactor: code change that neither fixes nor adds
perf: performance improvement
test: add or update tests
build: build system or dependencies
ci: CI configuration
chore: maintenance
```

## Pull Requests

1. Fork the repo and create a feature branch
2. Make your changes with tests
3. Ensure `pnpm turbo typecheck` and `pnpm turbo test` pass
4. Submit a PR using the template
5. Wait for CI to pass and a maintainer review

## Code Style

- TypeScript with strict mode
- ESM modules (`.js` extensions in imports)
- Prettier for formatting (runs on commit via Husky)
- Tailwind CSS v4 for styling
- Zustand for client state
- Zod for API validation
- Drizzle ORM for database

## License

MIT — see [LICENSE](./LICENSE)
