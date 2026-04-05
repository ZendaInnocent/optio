import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ id: "test-id" }),
}));

// Mock the api-client module
vi.mock("@/lib/api-client", () => ({
  api: {
    getAgentRun: vi.fn(),
    getAgentRunEvents: vi.fn(),
    switchAgentRunMode: vi.fn(),
    endAgentRun: vi.fn(),
    interruptAgentRun: vi.fn(),
  },
}));

import { api } from "@/lib/api-client";
import AgentRunDetailPage from "./page";

const mockGetAgentRun = vi.mocked(api.getAgentRun);
const mockGetAgentRunEvents = vi.mocked(api.getAgentRunEvents);

const baseRun = {
  id: "test-id",
  title: "Test Run",
  mode: "autonomous",
  state: "running",
  agentType: "claude-code",
  repoUrl: "https://github.com/acme/project",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe("AgentRunDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAgentRun.mockResolvedValue({ run: { ...baseRun } });
    mockGetAgentRunEvents.mockResolvedValue({ events: [] });
  });

  afterEach(() => {
    cleanup();
  });

  it("shows mode switch button for non-ended runs", async () => {
    render(<AgentRunDetailPage />);
    expect(await screen.findByText("Switch Mode")).toBeInTheDocument();
  });

  it("shows chat and terminal tabs for interactive mode", async () => {
    mockGetAgentRun.mockResolvedValue({
      run: { ...baseRun, id: "interactive-id", mode: "interactive" },
    });
    render(<AgentRunDetailPage />);
    expect(await screen.findByRole("tab", { name: /chat/i })).toBeInTheDocument();
    expect(await screen.findByRole("tab", { name: /terminal/i })).toBeInTheDocument();
  });

  it("does not show chat/terminal tabs for autonomous mode", async () => {
    mockGetAgentRun.mockResolvedValue({
      run: { ...baseRun, id: "auto-id", mode: "autonomous" },
    });
    render(<AgentRunDetailPage />);
    // Wait for loading to finish by waiting for Overview tab
    await screen.findByText("Overview");
    expect(screen.queryByRole("tab", { name: /chat/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /terminal/i })).not.toBeInTheDocument();
  });
});
