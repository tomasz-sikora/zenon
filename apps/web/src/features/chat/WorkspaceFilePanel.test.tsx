/**
 * WorkspaceFilePanel component tests.
 *
 * - Mocks the workspace store
 * - Uses the in-memory OPFS mock from src/test/setup.ts
 * - Verifies that the panel renders workspace files, can be closed,
 *   and refreshes when refreshKey changes.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { WorkspaceFilePanel } from "@/features/chat/WorkspaceFilePanel";
import { writeFile, ensureDir } from "@/lib/storage/opfs";

// ─── Workspace store mock ─────────────────────────────────────────────────────

vi.mock("@/store/workspaceStore", () => ({
  useWorkspaceStore: (selector?: (s: unknown) => unknown) => {
    const state = {
      workspaces: [
        {
          id: "test-ws",
          name: "Test Workspace",
          createdAt: Date.now(),
          updatedAt: Date.now(),
          conversationCount: 0,
          fileCount: 0,
          totalSize: 0,
        },
      ],
      currentWorkspaceId: "test-ws",
    };
    return selector ? selector(state) : state;
  },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function seedFiles() {
  await ensureDir("workspaces/test-ws/files");
  await writeFile("workspaces/test-ws/files/readme.txt", "Hello!");
  await writeFile("workspaces/test-ws/files/script.py", "print('hi')");
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("WorkspaceFilePanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the panel with workspace name in header", async () => {
    await seedFiles();
    render(<WorkspaceFilePanel refreshKey={0} onClose={() => {}} />);

    expect(await screen.findByTestId("workspace-file-panel")).toBeDefined();
    expect(await screen.findByText("Test Workspace")).toBeDefined();
  });

  it("lists files from the workspace", async () => {
    await seedFiles();
    render(<WorkspaceFilePanel refreshKey={0} onClose={() => {}} />);

    expect(await screen.findByTestId("panel-entry-readme.txt")).toBeDefined();
    expect(await screen.findByTestId("panel-entry-script.py")).toBeDefined();
  });

  it("calls onClose when close button is clicked", async () => {
    await seedFiles();
    const onClose = vi.fn();
    render(<WorkspaceFilePanel refreshKey={0} onClose={onClose} />);

    // Wait for panel to render
    await screen.findByTestId("workspace-file-panel");

    const closeBtn = screen.getByLabelText("Close workspace file panel");
    fireEvent.click(closeBtn);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows 'No files yet' when workspace has no files", async () => {
    await ensureDir("workspaces/test-ws/files");
    render(<WorkspaceFilePanel refreshKey={0} onClose={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText(/No files yet/i)).toBeDefined();
    });
  });

  it("re-fetches files when refreshKey changes", async () => {
    await ensureDir("workspaces/test-ws/files");
    const { rerender } = render(<WorkspaceFilePanel refreshKey={0} onClose={() => {}} />);

    // Initially empty
    await waitFor(() => {
      expect(screen.getByText(/No files yet/i)).toBeDefined();
    });

    // Add a file and bump refreshKey
    await writeFile("workspaces/test-ws/files/new.txt", "new content");
    rerender(<WorkspaceFilePanel refreshKey={1} onClose={() => {}} />);

    expect(await screen.findByTestId("panel-entry-new.txt")).toBeDefined();
  });

  it("has a refresh button that reloads files", async () => {
    await seedFiles();
    render(<WorkspaceFilePanel refreshKey={0} onClose={() => {}} />);

    await screen.findByTestId("workspace-file-panel");

    const refreshBtn = screen.getByLabelText("Refresh file tree");
    expect(refreshBtn).toBeDefined();

    // Should not throw
    fireEvent.click(refreshBtn);

    // Files still visible after refresh
    expect(await screen.findByTestId("panel-entry-readme.txt")).toBeDefined();
  });
});
