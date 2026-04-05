import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

// Mock next/navigation
const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => new URLSearchParams(),
}));

// Mock the api-client module
vi.mock("@/lib/api-client", () => ({
  api: {
    listAgentRuns: vi.fn(),
  },
}));

import { api } from "@/lib/api-client";
import AgentRunsPage from "./page";

const mockListAgentRuns = vi.mocked(api.listAgentRuns);

const mockRuns = [
  {
    id: "run-1",
    title: "Implement new feature",
    mode: "autonomous",
    state: "completed",
    agentType: "claude-code",
    repoUrl: "https://github.com/acme/myproject",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    costUsd: "2.50",
    initialPrompt: "Add a new feature",
  },
  {
    id: "run-2",
    title: "Fix login bug",
    mode: "supervised",
    state: "running",
    agentType: "claude-code",
    repoUrl: "https://github.com/acme/myproject",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    costUsd: "0.75",
  },
];

describe("AgentRunsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListAgentRuns.mockResolvedValue({ runs: mockRuns });
  });

  afterEach(() => {
    cleanup();
  });

  it("displays agent runs with mode badges", async () => {
    render(<AgentRunsPage />);
    // Use findByText to wait for async render
    expect(await screen.findByText("autonomous")).toBeInTheDocument();
    expect(screen.getByText("supervised")).toBeInTheDocument();
  });

  it("renders the page title", () => {
    render(<AgentRunsPage />);
    expect(screen.getByText("Agent Runs")).toBeInTheDocument();
  });
});
