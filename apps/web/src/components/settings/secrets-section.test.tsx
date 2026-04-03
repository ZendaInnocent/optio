import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";

// Mock next/navigation
vi.mock("@/hooks/use-page-title", () => ({
  usePageTitle: vi.fn(),
}));

// Mock the API client
vi.mock("@/lib/api-client", () => ({
  api: {
    listSecrets: vi.fn(),
    listRepos: vi.fn(),
    getOptioSettings: vi.fn(),
    createSecret: vi.fn(),
    deleteSecret: vi.fn(),
  },
}));

// Mock sonner
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { api } from "@/lib/api-client";
import { SecretsSection } from "./secrets-section";

describe("SecretsSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders loading state initially", () => {
    api.listSecrets.mockImplementation(() => new Promise(() => {})); // never resolves
    render(<SecretsSection />);
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("renders empty state when no secrets exist", async () => {
    api.listSecrets.mockResolvedValue({ secrets: [] });
    api.listRepos.mockResolvedValue({ repos: [] });
    api.getOptioSettings.mockResolvedValue({ settings: { agents: [] } });

    render(<SecretsSection />);

    await screen.findByText("No secrets configured");
  });

  it("displays secrets when they exist", async () => {
    const mockSecrets = [
      { id: "1", name: "ANTHROPIC_API_KEY", scope: "global" },
      { id: "2", name: "GITHUB_TOKEN", scope: "repo-1" },
    ];
    api.listSecrets.mockResolvedValue({ secrets: mockSecrets });
    api.listRepos.mockResolvedValue({ repos: [] });
    api.getOptioSettings.mockResolvedValue({ settings: { agents: [] } });

    render(<SecretsSection />);

    await screen.findByText("ANTHROPIC_API_KEY");
    expect(screen.getByText("GITHUB_TOKEN")).toBeInTheDocument();
  });

  it("shows the Add Secret button", async () => {
    api.listSecrets.mockResolvedValue({ secrets: [] });
    api.listRepos.mockResolvedValue({ repos: [] });
    api.getOptioSettings.mockResolvedValue({ settings: { agents: [] } });

    render(<SecretsSection />);

    await screen.findByRole("button", { name: /add secret/i });
  });

  it("shows the add form when Add Secret is clicked", async () => {
    api.listSecrets.mockResolvedValue({ secrets: [] });
    api.listRepos.mockResolvedValue({ repos: [] });
    api.getOptioSettings.mockResolvedValue({ settings: { agents: [] } });

    render(<SecretsSection />);

    await screen.findByRole("button", { name: /add secret/i });

    fireEvent.click(screen.getByRole("button", { name: /add secret/i }));

    // The form should be visible with inputs
    const form = document.querySelector("form");
    expect(form).toBeInTheDocument();
    expect(
      within(form as HTMLElement).getByPlaceholderText("ANTHROPIC_API_KEY"),
    ).toBeInTheDocument();
    expect(within(form as HTMLElement).getByPlaceholderText("sk-ant-...")).toBeInTheDocument();
  });

  it("creates a secret when form is submitted", async () => {
    api.listSecrets.mockResolvedValue({ secrets: [] });
    api.listRepos.mockResolvedValue({ repos: [] });
    api.getOptioSettings.mockResolvedValue({ settings: { agents: [] } });
    api.createSecret.mockResolvedValue({});

    render(<SecretsSection />);

    await screen.findByRole("button", { name: /add secret/i });

    fireEvent.click(screen.getByRole("button", { name: /add secret/i }));

    const form = document.querySelector("form");
    expect(form).toBeInTheDocument();
    const nameInput = within(form as HTMLElement).getByPlaceholderText("ANTHROPIC_API_KEY");
    const valueInput = within(form as HTMLElement).getByPlaceholderText("sk-ant-...");
    fireEvent.change(nameInput, { target: { value: "TEST_SECRET" } });
    fireEvent.change(valueInput, { target: { value: "secret-value" } });

    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(api.createSecret).toHaveBeenCalledWith({
      name: "TEST_SECRET",
      value: "secret-value",
      scope: "global",
    });
  });

  it("creates a secret when form is submitted", async () => {
    api.listSecrets.mockResolvedValue({ secrets: [] });
    api.listRepos.mockResolvedValue({ repos: [] });
    api.getOptioSettings.mockResolvedValue({ settings: { agents: [] } });
    api.createSecret.mockResolvedValue({});

    render(<SecretsSection />);

    await screen.findByRole("button", { name: /add secret/i });

    fireEvent.click(screen.getByRole("button", { name: /add secret/i }));

    const form = screen.getByRole("form", { hidden: true }) || document.querySelector("form");
    expect(form).toBeInTheDocument();
    const nameInput = within(form as HTMLElement).getByPlaceholderText("ANTHROPIC_API_KEY");
    const valueInput = within(form as HTMLElement).getByPlaceholderText("sk-ant-...");
    fireEvent.change(nameInput, { target: { value: "TEST_SECRET" } });
    fireEvent.change(valueInput, { target: { value: "secret-value" } });

    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(api.createSecret).toHaveBeenCalledWith({
      name: "TEST_SECRET",
      value: "secret-value",
      scope: "global",
    });
  });

  it("displays required secrets banner when agents are enabled", async () => {
    api.listSecrets.mockResolvedValue({ secrets: [] });
    api.listRepos.mockResolvedValue({ repos: [] });
    api.getOptioSettings.mockResolvedValue({
      settings: {
        agents: [
          { type: "claude-code", enabled: true },
          { type: "codex", enabled: false },
        ],
      },
    });

    render(<SecretsSection />);

    await screen.findByText("Required for enabled agents");
    expect(screen.getByText("ANTHROPIC_API_KEY")).toBeInTheDocument();
    expect(screen.getByText("Missing:")).toBeInTheDocument();
  });

  it("deletes a secret when delete button is clicked", async () => {
    const mockSecrets = [{ id: "1", name: "TEST_SECRET", scope: "global" }];
    api.listSecrets.mockResolvedValue({ secrets: mockSecrets });
    api.listRepos.mockResolvedValue({ repos: [] });
    api.getOptioSettings.mockResolvedValue({ settings: { agents: [] } });
    api.deleteSecret.mockResolvedValue({});

    render(<SecretsSection />);

    await screen.findByText("TEST_SECRET");

    const deleteButton = screen.getByRole("button", { name: /delete secret/i });
    fireEvent.click(deleteButton);

    expect(api.deleteSecret).toHaveBeenCalledWith("TEST_SECRET", "global");
  });
});
