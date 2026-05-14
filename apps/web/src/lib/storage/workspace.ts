/**
 * Workspace manager — CRUD operations for workspaces stored in OPFS.
 * Each workspace lives at /workspaces/<id>/
 */

import type { WorkspaceMeta } from "@zenon/shared-types";
import { writeFile, readFileText, deleteDir, ensureDir, fileExists } from "./opfs";
import { generateId } from "@/lib/utils";

const WORKSPACES_ROOT = "workspaces";

function metaPath(id: string) {
  return `${WORKSPACES_ROOT}/${id}/meta.json`;
}

export async function createWorkspace(name: string, description?: string): Promise<WorkspaceMeta> {
  const id = generateId();
  const now = Date.now();
  const meta: WorkspaceMeta = {
    id,
    name,
    description,
    createdAt: now,
    updatedAt: now,
    conversationCount: 0,
    fileCount: 0,
    totalSize: 0,
  };
  // Create directory structure
  await ensureDir(`${WORKSPACES_ROOT}/${id}/files`);
  await ensureDir(`${WORKSPACES_ROOT}/${id}/artifacts`);
  await ensureDir(`${WORKSPACES_ROOT}/${id}/history`);
  await ensureDir(`${WORKSPACES_ROOT}/${id}/vectors`);
  await writeFile(metaPath(id), JSON.stringify(meta, null, 2));
  return meta;
}

export async function getWorkspace(id: string): Promise<WorkspaceMeta | null> {
  try {
    const text = await readFileText(metaPath(id));
    return JSON.parse(text) as WorkspaceMeta;
  } catch {
    return null;
  }
}

export async function updateWorkspace(id: string, updates: Partial<WorkspaceMeta>): Promise<WorkspaceMeta> {
  const existing = await getWorkspace(id);
  if (!existing) throw new Error(`Workspace ${id} not found`);
  const updated: WorkspaceMeta = { ...existing, ...updates, id, updatedAt: Date.now() };
  await writeFile(metaPath(id), JSON.stringify(updated, null, 2));
  return updated;
}

export async function deleteWorkspace(id: string): Promise<void> {
  await deleteDir(`${WORKSPACES_ROOT}/${id}`, true);
}

export async function listWorkspaces(): Promise<WorkspaceMeta[]> {
  try {
    const { listDir } = await import("./opfs");
    const entries = await listDir(WORKSPACES_ROOT);
    const metas: WorkspaceMeta[] = [];
    for (const entry of entries) {
      if (entry.kind === "directory") {
        const meta = await getWorkspace(entry.name);
        if (meta) metas.push(meta);
      }
    }
    return metas.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export async function workspaceExists(id: string): Promise<boolean> {
  return fileExists(metaPath(id));
}

/** Path helpers for workspace subdirectories */
export const workspacePaths = {
  files: (id: string) => `${WORKSPACES_ROOT}/${id}/files`,
  artifacts: (id: string) => `${WORKSPACES_ROOT}/${id}/artifacts`,
  history: (id: string) => `${WORKSPACES_ROOT}/${id}/history`,
  vectors: (id: string) => `${WORKSPACES_ROOT}/${id}/vectors`,
  file: (id: string, filename: string) => `${WORKSPACES_ROOT}/${id}/files/${filename}`,
  artifact: (id: string, filename: string) => `${WORKSPACES_ROOT}/${id}/artifacts/${filename}`,
};
