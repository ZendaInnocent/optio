# When to Mock

Mock at **system boundaries** only:

- External APIs (GitHub, K8s, cloud providers)
- Databases (prefer test DB when possible)
- Time/randomness
- File system (sometimes)
- External services you don't control

Don't mock:

- Your own classes/modules
- Internal collaborators
- Anything you control

## Optio Boundaries

Where to mock in Optio:

- `KubernetesClient` - mock K8s API calls
- `GitHubClient` - mock GitHub API calls
- `DockerClient` - mock Docker API calls
- Time functions - for testing timeout behavior

What NOT to mock:

- `WorktreeManager` - test with real git operations
- `PodManager` - test with real K8s interactions (or test K8s client interface)
- `AgentService` - test through public API

## Designing for Mockability

### 1. Use Dependency Injection

Pass external dependencies rather than creating them internally:

```typescript
// Easy to mock
async function createPod(podManager: PodManager, spec: PodSpec) {
  return podManager.create(spec);
}

// Hard to mock - creates internally
async function createPod(spec: PodSpec) {
  const manager = new PodManager(); // hardcoded
  return manager.create(spec);
}
```

### 2. Prefer SDK-Style Interfaces

Create specific functions for each external operation:

```typescript
// GOOD: Each function is independently mockable
const k8s = {
  createPod: (spec) => k8sApi.post("/pods", { body: spec }),
  deletePod: (name) => k8sApi.delete(`/pods/${name}`),
  getPod: (name) => k8sApi.get(`/pods/${name}`),
};

// BAD: Mocking requires conditional logic
const k8s = {
  request: (method, path, body) => fetch(method, path, body),
};
```

### 3. Use Interfaces

Define interfaces that can be swapped:

```typescript
interface PodManager {
  create(spec: PodSpec): Promise<Pod>;
  delete(name: string): Promise<void>;
  get(name: string): Promise<Pod | null>;
}

// Real implementation
class K8sPodManager implements PodManager { ... }

// Mock for tests
class MockPodManager implements PodManager { ... }
```

This way tests use real code through the interface, not mocks of internal parts.
