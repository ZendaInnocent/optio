import { describe, it, expect } from "vitest";
import { canTransition, getInitialState, getTerminalStates } from "./agent-run-state-machine";
import { AgentRunState } from "../types/index.js";

describe("agentRunStateMachine", () => {
  it("allows pending -> queued", () => {
    expect(canTransition("pending" as AgentRunState, "queued" as AgentRunState)).toBe(true);
  });

  it("forbids completed -> running", () => {
    expect(canTransition("completed" as AgentRunState, "running" as AgentRunState)).toBe(false);
  });

  it("allows needs_attention -> running (resume)", () => {
    expect(canTransition("needs_attention" as AgentRunState, "running" as AgentRunState)).toBe(
      true,
    );
  });

  it("mode switching from any state allowed", () => {
    // This is a special metadata-driven transition that bypasses normal FSM
    expect(
      canTransition("running" as AgentRunState, "running" as AgentRunState, { modeSwitch: true }),
    ).toBe(true);
  });
});
