import { AgentRunState } from "../types/index.js";

export type TransitionContext = {
  modeSwitch?: boolean;
  fromMode?: string;
  toMode?: string;
};

const VALID_TRANSITIONS: Record<AgentRunState, AgentRunState[]> = {
  [AgentRunState.PENDING]: [AgentRunState.QUEUED, AgentRunState.CANCELLED],
  [AgentRunState.QUEUED]: [AgentRunState.PROVISIONING, AgentRunState.CANCELLED],
  [AgentRunState.PROVISIONING]: [
    AgentRunState.RUNNING,
    AgentRunState.FAILED,
    AgentRunState.CANCELLED,
  ],
  [AgentRunState.RUNNING]: [
    AgentRunState.NEEDS_ATTENTION,
    AgentRunState.COMPLETED,
    AgentRunState.FAILED,
    AgentRunState.CANCELLED,
  ],
  [AgentRunState.NEEDS_ATTENTION]: [
    AgentRunState.RUNNING,
    AgentRunState.CANCELLED,
    AgentRunState.FAILED,
  ],
  [AgentRunState.COMPLETED]: [],
  [AgentRunState.FAILED]: [AgentRunState.QUEUED], // retry
  [AgentRunState.CANCELLED]: [],
};

export function canTransition(
  from: AgentRunState,
  to: AgentRunState,
  _ctx: TransitionContext = {},
): boolean {
  // Mode switch is metadata; still require valid state transition
  const allowed = VALID_TRANSITIONS[from];
  return allowed.includes(to);
}

export function getInitialState(): AgentRunState {
  return AgentRunState.PENDING;
}

export const TERMINAL_STATES: AgentRunState[] = [
  AgentRunState.COMPLETED,
  AgentRunState.FAILED,
  AgentRunState.CANCELLED,
];
