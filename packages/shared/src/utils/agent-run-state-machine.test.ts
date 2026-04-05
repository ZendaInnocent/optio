import { describe, it, expect } from "vitest";
import { canTransition, getInitialState, TERMINAL_STATES } from "./agent-run-state-machine";
import { AgentRunState } from "../types/index.js";

describe("agentRunStateMachine", () => {
  describe("getInitialState", () => {
    it("returns PENDING as initial state", () => {
      expect(getInitialState()).toBe(AgentRunState.PENDING);
    });
  });

  describe("TERMINAL_STATES", () => {
    it("contains COMPLETED", () => {
      expect(TERMINAL_STATES).toContain(AgentRunState.COMPLETED);
    });
    it("contains FAILED", () => {
      expect(TERMINAL_STATES).toContain(AgentRunState.FAILED);
    });
    it("contains CANCELLED", () => {
      expect(TERMINAL_STATES).toContain(AgentRunState.CANCELLED);
    });
    it("does not contain non-terminal states", () => {
      expect(TERMINAL_STATES).not.toContain(AgentRunState.PENDING);
      expect(TERMINAL_STATES).not.toContain(AgentRunState.QUEUED);
      expect(TERMINAL_STATES).not.toContain(AgentRunState.PROVISIONING);
      expect(TERMINAL_STATES).not.toContain(AgentRunState.RUNNING);
      expect(TERMINAL_STATES).not.toContain(AgentRunState.NEEDS_ATTENTION);
    });
  });

  describe("canTransition - valid transitions", () => {
    // PENDING state transitions
    it("allows PENDING -> QUEUED", () => {
      expect(canTransition(AgentRunState.PENDING, AgentRunState.QUEUED)).toBe(true);
    });
    it("allows PENDING -> CANCELLED", () => {
      expect(canTransition(AgentRunState.PENDING, AgentRunState.CANCELLED)).toBe(true);
    });

    // QUEUED state transitions
    it("allows QUEUED -> PROVISIONING", () => {
      expect(canTransition(AgentRunState.QUEUED, AgentRunState.PROVISIONING)).toBe(true);
    });
    it("allows QUEUED -> CANCELLED", () => {
      expect(canTransition(AgentRunState.QUEUED, AgentRunState.CANCELLED)).toBe(true);
    });

    // PROVISIONING state transitions
    it("allows PROVISIONING -> RUNNING", () => {
      expect(canTransition(AgentRunState.PROVISIONING, AgentRunState.RUNNING)).toBe(true);
    });
    it("allows PROVISIONING -> FAILED", () => {
      expect(canTransition(AgentRunState.PROVISIONING, AgentRunState.FAILED)).toBe(true);
    });
    it("allows PROVISIONING -> CANCELLED", () => {
      expect(canTransition(AgentRunState.PROVISIONING, AgentRunState.CANCELLED)).toBe(true);
    });

    // RUNNING state transitions
    it("allows RUNNING -> NEEDS_ATTENTION", () => {
      expect(canTransition(AgentRunState.RUNNING, AgentRunState.NEEDS_ATTENTION)).toBe(true);
    });
    it("allows RUNNING -> COMPLETED", () => {
      expect(canTransition(AgentRunState.RUNNING, AgentRunState.COMPLETED)).toBe(true);
    });
    it("allows RUNNING -> FAILED", () => {
      expect(canTransition(AgentRunState.RUNNING, AgentRunState.FAILED)).toBe(true);
    });
    it("allows RUNNING -> CANCELLED", () => {
      expect(canTransition(AgentRunState.RUNNING, AgentRunState.CANCELLED)).toBe(true);
    });

    // NEEDS_ATTENTION state transitions
    it("allows NEEDS_ATTENTION -> RUNNING", () => {
      expect(canTransition(AgentRunState.NEEDS_ATTENTION, AgentRunState.RUNNING)).toBe(true);
    });
    it("allows NEEDS_ATTENTION -> CANCELLED", () => {
      expect(canTransition(AgentRunState.NEEDS_ATTENTION, AgentRunState.CANCELLED)).toBe(true);
    });
    it("allows NEEDS_ATTENTION -> FAILED", () => {
      expect(canTransition(AgentRunState.NEEDS_ATTENTION, AgentRunState.FAILED)).toBe(true);
    });

    // FAILED state transitions (retry)
    it("allows FAILED -> QUEUED (retry)", () => {
      expect(canTransition(AgentRunState.FAILED, AgentRunState.QUEUED)).toBe(true);
    });
  });

  describe("canTransition - invalid transitions", () => {
    // PENDING state invalid transitions
    it("forbids PENDING -> RUNNING", () => {
      expect(canTransition(AgentRunState.PENDING, AgentRunState.RUNNING)).toBe(false);
    });
    it("forbids PENDING -> PROVISIONING", () => {
      expect(canTransition(AgentRunState.PENDING, AgentRunState.PROVISIONING)).toBe(false);
    });
    it("forbids PENDING -> NEEDS_ATTENTION", () => {
      expect(canTransition(AgentRunState.PENDING, AgentRunState.NEEDS_ATTENTION)).toBe(false);
    });
    it("forbids PENDING -> COMPLETED (except via queued then running)", () => {
      expect(canTransition(AgentRunState.PENDING, AgentRunState.COMPLETED)).toBe(false);
    });
    it("forbids PENDING -> FAILED", () => {
      expect(canTransition(AgentRunState.PENDING, AgentRunState.FAILED)).toBe(false);
    });

    // QUEUED state invalid transitions
    it("forbids QUEUED -> RUNNING", () => {
      expect(canTransition(AgentRunState.QUEUED, AgentRunState.RUNNING)).toBe(false);
    });
    it("forbids QUEUED -> PROVISIONING directly? Actually allowed", () => {
      // Wait, this IS allowed per VALID_TRANSITIONS - QUEUED -> PROVISIONING is allowed
      expect(canTransition(AgentRunState.QUEUED, AgentRunState.PROVISIONING)).toBe(true);
    });
    it("forbids QUEUED -> COMPLETED", () => {
      expect(canTransition(AgentRunState.QUEUED, AgentRunState.COMPLETED)).toBe(false);
    });
    it("forbids QUEUED -> FAILED", () => {
      expect(canTransition(AgentRunState.QUEUED, AgentRunState.FAILED)).toBe(false);
    });
    it("forbids QUEUED -> NEEDS_ATTENTION", () => {
      expect(canTransition(AgentRunState.QUEUED, AgentRunState.NEEDS_ATTENTION)).toBe(false);
    });

    // PROVISIONING state invalid transitions
    it("forbids PROVISIONING -> QUEUED", () => {
      expect(canTransition(AgentRunState.PROVISIONING, AgentRunState.QUEUED)).toBe(false);
    });
    it("forbids PROVISIONING -> PENDING", () => {
      expect(canTransition(AgentRunState.PROVISIONING, AgentRunState.PENDING)).toBe(false);
    });
    it("forbids PROVISIONING -> NEEDS_ATTENTION", () => {
      expect(canTransition(AgentRunState.PROVISIONING, AgentRunState.NEEDS_ATTENTION)).toBe(false);
    });
    it("forbids PROVISIONING -> COMPLETED", () => {
      expect(canTransition(AgentRunState.PROVISIONING, AgentRunState.COMPLETED)).toBe(false);
    });

    // RUNNING state invalid transitions
    it("forbids RUNNING -> QUEUED", () => {
      expect(canTransition(AgentRunState.RUNNING, AgentRunState.QUEUED)).toBe(false);
    });
    it("forbids RUNNING -> PROVISIONING", () => {
      expect(canTransition(AgentRunState.RUNNING, AgentRunState.PROVISIONING)).toBe(false);
    });
    it("forbids RUNNING -> PENDING", () => {
      expect(canTransition(AgentRunState.RUNNING, AgentRunState.PENDING)).toBe(false);
    });

    // NEEDS_ATTENTION state invalid transitions
    it("forbids NEEDS_ATTENTION -> QUEUED", () => {
      expect(canTransition(AgentRunState.NEEDS_ATTENTION, AgentRunState.QUEUED)).toBe(false);
    });
    it("forbids NEEDS_ATTENTION -> PROVISIONING", () => {
      expect(canTransition(AgentRunState.NEEDS_ATTENTION, AgentRunState.PROVISIONING)).toBe(false);
    });
    it("forbids NEEDS_ATTENTION -> PENDING", () => {
      expect(canTransition(AgentRunState.NEEDS_ATTENTION, AgentRunState.PENDING)).toBe(false);
    });
    it("forbids NEEDS_ATTENTION -> COMPLETED", () => {
      expect(canTransition(AgentRunState.NEEDS_ATTENTION, AgentRunState.COMPLETED)).toBe(false);
    });

    // Terminal state: COMPLETED - no outgoing transitions
    it("forbids COMPLETED -> any other state", () => {
      expect(canTransition(AgentRunState.COMPLETED, AgentRunState.PENDING)).toBe(false);
      expect(canTransition(AgentRunState.COMPLETED, AgentRunState.QUEUED)).toBe(false);
      expect(canTransition(AgentRunState.COMPLETED, AgentRunState.PROVISIONING)).toBe(false);
      expect(canTransition(AgentRunState.COMPLETED, AgentRunState.RUNNING)).toBe(false);
      expect(canTransition(AgentRunState.COMPLETED, AgentRunState.NEEDS_ATTENTION)).toBe(false);
      expect(canTransition(AgentRunState.COMPLETED, AgentRunState.FAILED)).toBe(false);
      expect(canTransition(AgentRunState.COMPLETED, AgentRunState.CANCELLED)).toBe(false);
    });

    // Terminal state: CANCELLED - no outgoing transitions
    it("forbids CANCELLED -> any other state", () => {
      expect(canTransition(AgentRunState.CANCELLED, AgentRunState.PENDING)).toBe(false);
      expect(canTransition(AgentRunState.CANCELLED, AgentRunState.QUEUED)).toBe(false);
      expect(canTransition(AgentRunState.CANCELLED, AgentRunState.PROVISIONING)).toBe(false);
      expect(canTransition(AgentRunState.CANCELLED, AgentRunState.RUNNING)).toBe(false);
      expect(canTransition(AgentRunState.CANCELLED, AgentRunState.NEEDS_ATTENTION)).toBe(false);
      expect(canTransition(AgentRunState.CANCELLED, AgentRunState.COMPLETED)).toBe(false);
      expect(canTransition(AgentRunState.CANCELLED, AgentRunState.FAILED)).toBe(false);
    });

    // FAILED state - only retry to QUEUED allowed
    it("forbids FAILED -> PENDING", () => {
      expect(canTransition(AgentRunState.FAILED, AgentRunState.PENDING)).toBe(false);
    });
    it("forbids FAILED -> PROVISIONING", () => {
      expect(canTransition(AgentRunState.FAILED, AgentRunState.PROVISIONING)).toBe(false);
    });
    it("forbids FAILED -> RUNNING", () => {
      expect(canTransition(AgentRunState.FAILED, AgentRunState.RUNNING)).toBe(false);
    });
    it("forbids FAILED -> NEEDS_ATTENTION", () => {
      expect(canTransition(AgentRunState.FAILED, AgentRunState.NEEDS_ATTENTION)).toBe(false);
    });
    it("forbids FAILED -> COMPLETED", () => {
      expect(canTransition(AgentRunState.FAILED, AgentRunState.COMPLETED)).toBe(false);
    });
    it("forbids FAILED -> CANCELLED", () => {
      expect(canTransition(AgentRunState.FAILED, AgentRunState.CANCELLED)).toBe(false);
    });

    // Cancellation from various states is allowed (covered in valid tests)
    // These are invalid patterns that might be mistakenly thought valid
    it("forbids state transitions that skip stages", () => {
      // Direct jumps over intermediate states
      expect(canTransition(AgentRunState.PENDING, AgentRunState.RUNNING)).toBe(false);
      expect(canTransition(AgentRunState.PENDING, AgentRunState.COMPLETED)).toBe(false);
      expect(canTransition(AgentRunState.QUEUED, AgentRunState.COMPLETED)).toBe(false);
      expect(canTransition(AgentRunState.PROVISIONING, AgentRunState.COMPLETED)).toBe(false);
    });
  });

  describe("canTransition - cancellation from each state", () => {
    it("allows PENDING -> CANCELLED", () => {
      expect(canTransition(AgentRunState.PENDING, AgentRunState.CANCELLED)).toBe(true);
    });
    it("allows QUEUED -> CANCELLED", () => {
      expect(canTransition(AgentRunState.QUEUED, AgentRunState.CANCELLED)).toBe(true);
    });
    it("allows PROVISIONING -> CANCELLED", () => {
      expect(canTransition(AgentRunState.PROVISIONING, AgentRunState.CANCELLED)).toBe(true);
    });
    it("allows RUNNING -> CANCELLED", () => {
      expect(canTransition(AgentRunState.RUNNING, AgentRunState.CANCELLED)).toBe(true);
    });
    it("allows NEEDS_ATTENTION -> CANCELLED", () => {
      expect(canTransition(AgentRunState.NEEDS_ATTENTION, AgentRunState.CANCELLED)).toBe(true);
    });
  });

  describe("canTransition - retry behavior", () => {
    it("allows FAILED -> QUEUED as retry mechanism", () => {
      expect(canTransition(AgentRunState.FAILED, AgentRunState.QUEUED)).toBe(true);
    });
    it("allows multiple retry cycles", () => {
      // After retry, can fail again and retry again
      expect(canTransition(AgentRunState.QUEUED, AgentRunState.FAILED)).toBe(false); // queued -> failed not direct, must go through provisioning/running
      expect(canTransition(AgentRunState.FAILED, AgentRunState.QUEUED)).toBe(true);
    });
  });

  describe("canTransition - modeSwitch flag does not bypass validation", () => {
    it("allows valid transition with modeSwitch flag", () => {
      // Valid transitions should still work with modeSwitch
      expect(canTransition(AgentRunState.PENDING, AgentRunState.QUEUED, { modeSwitch: true })).toBe(
        true,
      );
      expect(
        canTransition(AgentRunState.RUNNING, AgentRunState.NEEDS_ATTENTION, { modeSwitch: true }),
      ).toBe(true);
      expect(canTransition(AgentRunState.FAILED, AgentRunState.QUEUED, { modeSwitch: true })).toBe(
        true,
      );
    });

    it("forbids invalid transition even with modeSwitch flag", () => {
      // Invalid transitions should still fail with modeSwitch
      expect(
        canTransition(AgentRunState.PENDING, AgentRunState.RUNNING, { modeSwitch: true }),
      ).toBe(false);
      expect(
        canTransition(AgentRunState.COMPLETED, AgentRunState.RUNNING, { modeSwitch: true }),
      ).toBe(false);
      expect(
        canTransition(AgentRunState.CANCELLED, AgentRunState.QUEUED, { modeSwitch: true }),
      ).toBe(false);
      expect(
        canTransition(AgentRunState.RUNNING, AgentRunState.PROVISIONING, { modeSwitch: true }),
      ).toBe(false);
    });

    it("modeSwitch on terminal states still fails", () => {
      expect(
        canTransition(AgentRunState.COMPLETED, AgentRunState.FAILED, { modeSwitch: true }),
      ).toBe(false);
      expect(canTransition(AgentRunState.FAILED, AgentRunState.FAILED, { modeSwitch: true })).toBe(
        false,
      );
    });

    it("self-transition with modeSwitch only allowed if self-transition is in valid transitions", () => {
      // Self-transitions (state -> same state) are not in VALID_TRANSITIONS
      // So they should fail even with modeSwitch
      expect(
        canTransition(AgentRunState.PENDING, AgentRunState.PENDING, { modeSwitch: true }),
      ).toBe(false);
      expect(
        canTransition(AgentRunState.RUNNING, AgentRunState.RUNNING, { modeSwitch: true }),
      ).toBe(false);
      expect(canTransition(AgentRunState.QUEUED, AgentRunState.QUEUED, { modeSwitch: true })).toBe(
        false,
      );
    });
  });
});
