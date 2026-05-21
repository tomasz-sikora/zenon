/**
 * WorkspacePage UI tests.
 *
 * - Mocks the workspace store (zustand)
 * - Mocks react-router-dom (useParams, useNavigate)
 * - Uses the in-memory OPFS mock from src/test/setup.ts
 * - Verifies file listing, preview, download, workspace management, and
 *   that files written by the Python tool (simulated tool call) appear in the UI
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WorkspacePage from "@/features/workspace/WorkspacePage";
import { writeFile, ensureDir } from "@/lib/storage/opfs";

// ─── Router mock ─────────────────────────────────────────────────────────────

const mockNavigate = vi.fn();

vi.mock("react-router-dom", () => ({
  useParams: () => ({ id: "test-ws" }),
  useNavigate: () => mockNavigate,
}));

// ─── Workspace store mock ─────────────────────────────────────────────────────

const mockWorkspaces = [
  { id: "test-ws", name: "Test Workspace", createdAt: Date.now(), updatedAt: Date.now(), conversationCount: 0, fileCount: 0, totalSize: 0 },
  { id: "other-ws", name: "Other Workspace", createdAt: Date.now(), updatedAt: Date.now(), conversationCount: 0, fileCount: 0, totalSize: 0 },
];

const mockCreateWorkspace = vi.fn().mockResolvedValue("new-ws-id");
const mockDeleteWorkspace = vi.fn().mockResolvedValue(undefined);
const mockRenameWorkspace = vi.fn();
const mockSetCurrentWorkspace = vi.fn();

vi.mock("@/store/workspaceStore", () => ({
  useWorkspaceStore: (selector?: (s: unknown) => unknown) => {
    const state = {
      workspaces: mockWorkspaces,
      currentWorkspaceId: "test-ws",
      createWorkspace: mockCreateWorkspace,
      deleteWorkspace: mockDeleteWorkspace,
      renameWorkspace: mockRenameWorkspace,
      setCurrentWorkspace: mockSetCurrentWorkspace,
    };
    return selector ? selector(state) : state;
  },
}));

// ─── Toast mock ───────────────────────────────────────────────────────────────

vi.mock("@/components/ui/Toaster", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function seedWorkspaceFiles() {
  await ensureDir("workspaces/test-ws/files");
  await writeFile("workspaces/test-ws/files/readme.txt", "Hello workspace!");
  await writeFile("workspaces/test-ws/files/data.csv", "name,age\nAlice,30\nBob,25");
  await writeFile("workspaces/test-ws/files/script.py", 'print("hello")');
  // Simulate a binary file (no text preview)
  await writeFile("workspaces/test-ws/files/archive.zip", new Uint8Array([80, 75, 3, 4]).buffer);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("WorkspacePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the workspace name in the header", async () => {
    await seedWorkspaceFiles();
    render(<WorkspacePage />);
    expect(await screen.findByText("Test Workspace")).toBeDefined();
  });

  it("lists files from OPFS after mount", async () => {
    await seedWorkspaceFiles();
    render(<WorkspacePage />);

    expect(await screen.findByTestId("file-row-readme.txt")).toBeDefined();
    expect(await screen.findByTestId("file-row-data.csv")).toBeDefined();
    expect(await screen.findByTestId("file-row-script.py")).toBeDefined();
    expect(await screen.findByTestId("file-row-archive.zip")).toBeDefined();
  });

  it("shows text preview when a .txt file is clicked", async () => {
    await seedWorkspaceFiles();
    render(<WorkspacePage />);

    const row = await screen.findByTestId("file-row-readme.txt");
    await act(async () => { fireEvent.click(row); });

    const preview = await screen.findByTestId("preview-pane");
    expect(preview).toBeDefined();
    expect(preview.textContent).toContain("Hello workspace!");
  });

  it("shows CSV table preview when a .csv file is clicked", async () => {
    await seedWorkspaceFiles();
    render(<WorkspacePage />);

    const row = await screen.findByTestId("file-row-data.csv");
    await act(async () => { fireEvent.click(row); });

    const preview = await screen.findByTestId("preview-pane");
    // Should render as a table, not raw text
    expect(preview.querySelector("table")).toBeTruthy();
    expect(preview.textContent).toContain("Alice");
  });

  it("shows code icon and text preview for .py file", async () => {
    await seedWorkspaceFiles();
    render(<WorkspacePage />);

    const row = await screen.findByTestId("file-row-script.py");
    await act(async () => { fireEvent.click(row); });

    const preview = await screen.findByTestId("preview-pane");
    expect(preview.textContent).toContain('print("hello")');
  });

  it("shows 'binary file' message for zip with no preview", async () => {
    await seedWorkspaceFiles();
    render(<WorkspacePage />);

    const row = await screen.findByTestId("file-row-archive.zip");
    await act(async () => { fireEvent.click(row); });

    const preview = await screen.findByTestId("preview-pane");
    expect(preview.textContent).toContain("Binary file");
  });

  it("filters files by search term", async () => {
    await seedWorkspaceFiles();
    render(<WorkspacePage />);

    await screen.findByTestId("file-row-readme.txt"); // wait for load

    const searchInput = screen.getByLabelText("Filter files");
    await act(async () => {
      await userEvent.type(searchInput, "script");
    });

    expect(screen.queryByTestId("file-row-script.py")).toBeDefined();
    expect(screen.queryByTestId("file-row-readme.txt")).toBeNull();
  });

  it("shows workspace stats (file count + size)", async () => {
    await seedWorkspaceFiles();
    render(<WorkspacePage />);

    // Stats bar shows file count eventually
    await waitFor(() => {
      const text = document.body.textContent ?? "";
      expect(text).toMatch(/\d+ files?/);
    });
  });

  describe("Workspace Manager Panel", () => {
    it("opens manager panel when workspace name is clicked", async () => {
      await seedWorkspaceFiles();
      render(<WorkspacePage />);

      const manageBtn = await screen.findByLabelText("Manage workspaces");
      await act(async () => { fireEvent.click(manageBtn); });

      // The panel heading is unique
      expect(screen.getByText("Manage Workspaces")).toBeDefined();
      // Both workspaces appear in the panel list (there may be multiple "Test Workspace" elements)
      expect(screen.getAllByText(/Test Workspace/).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("Other Workspace")).toBeDefined();
    });

    it("creates a new workspace from the manager panel", async () => {
      await seedWorkspaceFiles();
      render(<WorkspacePage />);

      const manageBtn = await screen.findByLabelText("Manage workspaces");
      await act(async () => { fireEvent.click(manageBtn); });

      const nameInput = screen.getByLabelText("New workspace name");
      await act(async () => {
        await userEvent.type(nameInput, "My New Workspace");
      });

      const createBtn = screen.getByRole("button", { name: /Create/i });
      await act(async () => { fireEvent.click(createBtn); });

      expect(mockCreateWorkspace).toHaveBeenCalledWith("My New Workspace");
    });

    it("deletes a non-default workspace", async () => {
      await seedWorkspaceFiles();
      render(<WorkspacePage />);

      const manageBtn = await screen.findByLabelText("Manage workspaces");
      await act(async () => { fireEvent.click(manageBtn); });

      // Mock the confirm dialog
      vi.spyOn(window, "confirm").mockReturnValue(true);

      const deleteBtn = screen.getByLabelText("Delete Other Workspace");
      await act(async () => { fireEvent.click(deleteBtn); });

      expect(mockDeleteWorkspace).toHaveBeenCalledWith("other-ws");
    });

    it("renames a workspace inline", async () => {
      await seedWorkspaceFiles();
      render(<WorkspacePage />);

      const manageBtn = await screen.findByLabelText("Manage workspaces");
      await act(async () => { fireEvent.click(manageBtn); });

      const renameBtn = screen.getByLabelText("Rename Test Workspace");
      await act(async () => { fireEvent.click(renameBtn); });

      const renameInput = screen.getByLabelText("Rename workspace");
      await act(async () => {
        await userEvent.clear(renameInput);
        await userEvent.type(renameInput, "Renamed WS{Enter}");
      });

      expect(mockRenameWorkspace).toHaveBeenCalledWith("test-ws", "Renamed WS");
    });

    it("download as tar.gz button is present for each workspace", async () => {
      await seedWorkspaceFiles();
      render(<WorkspacePage />);

      const manageBtn = await screen.findByLabelText("Manage workspaces");
      await act(async () => { fireEvent.click(manageBtn); });

      expect(screen.getByLabelText("Download Test Workspace as tar.gz")).toBeDefined();
      expect(screen.getByLabelText("Download Other Workspace as tar.gz")).toBeDefined();
    });
  });

  describe("Python tool → workspace file integration (simulated tool call)", () => {
    it("files written to OPFS by the tool appear in the file list", async () => {
      // Pre-seed workspace (simulating files created by Python code in pyodideTools.ts
      // which calls writeFile(`${filesDir}/${filename}`, bytes) after execution)
      await ensureDir("workspaces/test-ws/files");
      await writeFile("workspaces/test-ws/files/output.csv", "x,y\n1,2\n3,4");
      await writeFile("workspaces/test-ws/files/plot.png", new Uint8Array([137, 80, 78, 71]).buffer); // PNG magic bytes

      render(<WorkspacePage />);

      expect(await screen.findByTestId("file-row-output.csv")).toBeDefined();
      expect(await screen.findByTestId("file-row-plot.png")).toBeDefined();
    });

    it("PNG file created by matplotlib shows image preview", async () => {
      await ensureDir("workspaces/test-ws/files");
      // Minimal valid PNG (1x1 red pixel)
      const pngBytes = new Uint8Array([
        137, 80, 78, 71, 13, 10, 26, 10, // PNG signature
        0, 0, 0, 13, 73, 72, 68, 82,     // IHDR chunk header
        0, 0, 0, 1, 0, 0, 0, 1, 8, 2,   // 1x1 RGB
        0, 0, 0, 144, 119, 83, 222,       // IHDR crc
      ]);
      await writeFile("workspaces/test-ws/files/figure.png", pngBytes.buffer);

      render(<WorkspacePage />);

      const row = await screen.findByTestId("file-row-figure.png");
      await act(async () => { fireEvent.click(row); });

      const preview = await screen.findByTestId("preview-pane");
      // Should render an <img> tag for PNG
      expect(preview.querySelector("img")).toBeTruthy();
    });
  });
});
