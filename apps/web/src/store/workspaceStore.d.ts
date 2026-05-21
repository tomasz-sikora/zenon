import type { WorkspaceMeta } from "@zenon/shared-types";
interface WorkspaceStore {
    workspaces: WorkspaceMeta[];
    currentWorkspaceId: string | null;
    createWorkspace: (name: string, description?: string) => Promise<string>;
    deleteWorkspace: (id: string) => Promise<void>;
    renameWorkspace: (id: string, name: string) => void;
    setCurrentWorkspace: (id: string) => void;
    updateWorkspaceMeta: (id: string, patch: Partial<WorkspaceMeta>) => void;
}
export declare const useWorkspaceStore: import("zustand").UseBoundStore<Omit<import("zustand").StoreApi<WorkspaceStore>, "setState" | "persist"> & {
    setState(partial: WorkspaceStore | Partial<WorkspaceStore> | ((state: WorkspaceStore) => WorkspaceStore | Partial<WorkspaceStore>), replace?: false | undefined): unknown;
    setState(state: WorkspaceStore | ((state: WorkspaceStore) => WorkspaceStore), replace: true): unknown;
    persist: {
        setOptions: (options: Partial<import("zustand/middleware").PersistOptions<WorkspaceStore, WorkspaceStore, unknown>>) => void;
        clearStorage: () => void;
        rehydrate: () => Promise<void> | void;
        hasHydrated: () => boolean;
        onHydrate: (fn: (state: WorkspaceStore) => void) => () => void;
        onFinishHydration: (fn: (state: WorkspaceStore) => void) => () => void;
        getOptions: () => Partial<import("zustand/middleware").PersistOptions<WorkspaceStore, WorkspaceStore, unknown>>;
    };
}>;
export {};
