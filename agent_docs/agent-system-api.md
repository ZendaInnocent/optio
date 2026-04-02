# Agent API Endpoints

All agent-related HTTP endpoints are defined in the API application.

| Method | Endpoint                    | Description                    |
| ------ | --------------------------- | ------------------------------ |
| POST   | `/agents/run`               | Start a new agent run          |
| GET    | `/agents`                   | List all agent threads         |
| GET    | `/agents/:threadId`         | Get thread status              |
| GET    | `/agents/:threadId/history` | Get full event history         |
| POST   | `/agents/:threadId/pause`   | Pause a running thread         |
| POST   | `/agents/:threadId/resume`  | Resume a paused thread         |
| POST   | `/agents/:threadId/fork`    | Fork a thread at current state |
| POST   | `/agents/:threadId/context` | Build context for a thread     |

These endpoints are implemented in `apps/api/src/lib/agent/handlers/`.
