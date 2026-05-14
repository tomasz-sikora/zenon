import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { WorkspaceMeta } from "@zenon/shared-types";
import { generateId } from "@/lib/utils";
import { deleteDir } from "@/lib/storage/opfs";
import { ensureDir } from "@/lib/storage/opfs";

interface WorkspaceStore {
  workspaces: WorkspaceMeta[];
  currentWorkspaceId: string | null;

  createWorkspace: (name: string, description?: string) => Promise<string>;
  deleteWorkspace: (id: string) => Promise<void>;
  renameWorkspace: (id: string, name: string) => void;
  setCurrentWorkspace: (id: string) => void;
  updateWorkspaceMeta: (id: string, patch: Partial<WorkspaceMeta>) => void;
}

const DEFAULT_ID = "default";

function makeMeta(id: string, name: string, description?: string): WorkspaceMeta {
  return {
    id, name, description,
    createdAt: Date.now(), updatedAt: Date.now(),
    conversationCount: 0, fileCount: 0, totalSize: 0,
  };
}

const DEFAULT_WORKSPACE = makeMeta(DEFAULT_ID, "Default Workspace", "Your default workspace");

export const useWorkspaceStore = create<WorkspaceStore>()(
  persist(
    (set, get) => ({
      workspaces: [DEFAULT_WORKSPACE],
      currentWorkspaceId: DEFAULT_ID,

      createWorkspace: async (name, description) => {
        const id = generateId();
        const ws = makeMeta(id, name, description);
        // Create OPFS directory structure
        await ensureDir(`workspaces/${id}/files`);
        await ensureDir(`workspaces/${id}/artifacts`);
        await ensureDir(`workspaces/${id}/history`);
        set((s) => ({ workspaces: [...s.workspaces, ws], currentWorkspaceId: id }));
        return id;
      },

      deleteWorkspace: async (id) => {
        if (id === DEFAULT_ID) return;
        try { await deleteDir(`workspaces/${id}`, true); } catch { /* may not exist */ }
        set((s) => {
          const workspaces = s.workspaces.filter((w) => w.id !== id);
          return {
            workspaces,
            currentWorkspaceId: s.currentWorkspaceId === id ? (workspaces[0]?.id ?? null) : s.currentWorkspaceId,
          };
        });
      },

      renameWorkspace: (id, name) => {
        set((s) => ({
          workspaces: s.workspaces.map((w) => w.id === id ? { ...w, name, updatedAt: Date.now() } : w),
        }));
      },

      setCurrentWorkspace: (id) => {
        if (get().workspaces.some((w) => w.id === id)) {
          set({ currentWorkspaceId: id });
        }
      },

      updateWorkspaceMeta: (id, patch) => {
        set((s) => ({
          workspaces: s.workspaces.map((w) => w.id === id ? { ...w, ...patch, updatedAt: Date.now() } : w),
        }));
      },
    }),
    { name: "zenon-workspaces" },
  ),
);
