# Interface Design for Testability

Good interfaces make testing natural.

## 1. Accept Dependencies, Don't Create Them

```typescript
// Testable - dependency injected
async function allocatePod(agent: Agent, podManager: PodManager) {
  const spec = buildPodSpec(agent);
  return podManager.create(spec);
}

// Hard to test - creates internally
async function allocatePod(agent: Agent) {
  const podManager = new PodManager(); // hardcoded
  const spec = buildPodSpec(agent);
  return podManager.create(spec);
}
```

## 2. Return Results, Don't Produce Side Effects

```typescript
// Testable - returns result
function calculateResources(workload: Workload): ResourceSpec {
  return {
    cpu: workload.cpu * 1.5,
    memory: workload.memory * 1.2,
  };
}

// Hard to test - produces side effects
function applyResources(workload: Workload): void {
  workload.cpu *= 1.5;
  workload.memory *= 1.2;
}
```

## 3. Small Surface Area

Fewer methods = fewer tests needed.
Fewer params = simpler test setup.

```typescript
// Good - simple interface
interface AgentService {
  create(config: AgentConfig): Promise<Agent>;
  get(id: string): Promise<Agent | null>;
  execute(agentId: string, task: Task): Promise<TaskResult>;
}

// Avoid - large interface
interface AgentService {
  create(config: AgentConfig): Promise<Agent>;
  get(id: string): Promise<Agent | null>;
  execute(agentId: string, task: Task): Promise<TaskResult>;
  cancel(agentId: string): Promise<void>;
  pause(agentId: string): Promise<void>;
  resume(agentId: string): Promise<void>;
  getLogs(agentId: string): Promise<Log[]>;
  getStatus(agentId: string): Promise<AgentStatus>;
  // ... 20 more methods
}
```

## 4. Make Return Values Descriptive

```typescript
// Good - clear return type
interface PodManager {
  create(spec: PodSpec): Promise<{ pod: Pod; error?: PodError }>;
}

// Harder to test - unclear result
interface PodManager {
  create(spec: PodSpec): Promise<any>;
}
```

## 5. Design for Behavior, Not Implementation

The interface should describe what the system does, not how:

```typescript
// Good - describes behavior
interface WorktreeManager {
  create(config: WorktreeConfig): Promise<Worktree>;
  execute(worktreeId: string, command: string): Promise<ExecutionResult>;
}

// Bad - describes implementation
interface WorktreeManager {
  git(command: string, cwd: string): Promise<GitResult>;
  spawn(cmd: string, args: string[]): Promise<ChildProcess>;
}
```

## Summary

| Principle           | Why                                |
| ------------------- | ---------------------------------- |
| Accept dependencies | Easy to inject mocks at boundaries |
| Return results      | Easy to assert on returned values  |
| Small surface area  | Fewer tests needed                 |
| Descriptive returns | Clear assertions                   |
| Behavior-focused    | Tests survive refactors            |
