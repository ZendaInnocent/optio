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
  ctx: TransitionContext = {},
): boolean {
  // Mode switches are special: they may change the mode field but keep state as-is or move to needs_attention
  if (ctx.modeSwitch) {
    // Allow mode switch from any state to needs_attention (for interactive uplink)
    // Or keep same state if just changing mode mid-run
    return true;
  }

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

export function getTerminalStates(): AgentRunState[] {
  return TERMINAL_STATES;
}
