/**
 * Workspace manager — CRUD operations for workspaces stored in OPFS.
 * Each workspace lives at /workspaces/<id>/
 */
import type { WorkspaceMeta } from "@zenon/shared-types";
export declare function createWorkspace(name: string, description?: string): Promise<WorkspaceMeta>;
export declare function getWorkspace(id: string): Promise<WorkspaceMeta | null>;
export declare function updateWorkspace(id: string, updates: Partial<WorkspaceMeta>): Promise<WorkspaceMeta>;
export declare function deleteWorkspace(id: string): Promise<void>;
export declare function listWorkspaces(): Promise<WorkspaceMeta[]>;
export declare function workspaceExists(id: string): Promise<boolean>;
/** Path helpers for workspace subdirectories */
export declare const workspacePaths: {
    files: (id: string) => string;
    artifacts: (id: string) => string;
    history: (id: string) => string;
    vectors: (id: string) => string;
    file: (id: string, filename: string) => string;
    artifact: (id: string, filename: string) => string;
};
