/**
 * OPFS (Origin Private File System) abstraction layer.
 * Provides a simple async CRUD API over the browser's private file system.
 */

export async function getRoot(): Promise<FileSystemDirectoryHandle> {
  return navigator.storage.getDirectory();
}

async function resolveDir(
  root: FileSystemDirectoryHandle,
  parts: string[],
  create = false,
): Promise<FileSystemDirectoryHandle> {
  let dir = root;
  for (const part of parts) {
    dir = await dir.getDirectoryHandle(part, { create });
  }
  return dir;
}

function splitPath(path: string): string[] {
  return path.split("/").filter(Boolean);
}

export async function ensureDir(path: string): Promise<FileSystemDirectoryHandle> {
  const root = await getRoot();
  return resolveDir(root, splitPath(path), true);
}

export async function writeFile(path: string, data: ArrayBuffer | string): Promise<void> {
  const parts = splitPath(path);
  const fileName = parts.pop()!;
  const root = await getRoot();
  const dir = await resolveDir(root, parts, true);
  const fh = await dir.getFileHandle(fileName, { create: true });
  const writable = await fh.createWritable();
  if (typeof data === "string") {
    await writable.write(new TextEncoder().encode(data));
  } else {
    await writable.write(data);
  }
  await writable.close();
}

export async function readFile(path: string): Promise<ArrayBuffer> {
  const parts = splitPath(path);
  const fileName = parts.pop()!;
  const root = await getRoot();
  const dir = await resolveDir(root, parts, false);
  const fh = await dir.getFileHandle(fileName);
  const file = await fh.getFile();
  return file.arrayBuffer();
}

export async function readFileText(path: string): Promise<string> {
  const buf = await readFile(path);
  return new TextDecoder().decode(buf);
}

export async function readFileBlob(path: string): Promise<Blob> {
  const parts = splitPath(path);
  const fileName = parts.pop()!;
  const root = await getRoot();
  const dir = await resolveDir(root, parts, false);
  const fh = await dir.getFileHandle(fileName);
  return fh.getFile();
}

export async function deleteFile(path: string): Promise<void> {
  const parts = splitPath(path);
  const fileName = parts.pop()!;
  const root = await getRoot();
  const dir = await resolveDir(root, parts, false);
  await dir.removeEntry(fileName);
}

export async function deleteDir(path: string, recursive = false): Promise<void> {
  const parts = splitPath(path);
  const dirName = parts.pop()!;
  const root = await getRoot();
  const parent = await resolveDir(root, parts, false);
  await parent.removeEntry(dirName, { recursive });
}

export interface FileEntry {
  name: string;
  path: string;
  kind: "file" | "directory";
  size?: number;
  lastModified?: number;
  mimeType?: string;
}

export async function listDir(path: string): Promise<FileEntry[]> {
  const root = await getRoot();
  const parts = splitPath(path);
  const dir = await resolveDir(root, parts, false);
  const entries: FileEntry[] = [];
  for await (const [name, handle] of dir as unknown as AsyncIterable<[string, FileSystemHandle]>) {
    if (handle.kind === "file") {
      const fh = handle as FileSystemFileHandle;
      const file = await fh.getFile();
      entries.push({
        name,
        path: path.replace(/\/$/, "") + "/" + name,
        kind: "file",
        size: file.size,
        lastModified: file.lastModified,
        mimeType: file.type || guessMime(name),
      });
    } else {
      entries.push({
        name,
        path: path.replace(/\/$/, "") + "/" + name,
        kind: "directory",
      });
    }
  }
  return entries.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

export async function fileExists(path: string): Promise<boolean> {
  try {
    const parts = splitPath(path);
    const fileName = parts.pop()!;
    const root = await getRoot();
    const dir = await resolveDir(root, parts, false);
    await dir.getFileHandle(fileName);
    return true;
  } catch {
    return false;
  }
}

export async function moveFile(from: string, to: string): Promise<void> {
  const data = await readFile(from);
  await writeFile(to, data);
  await deleteFile(from);
}

const MIME_MAP: Record<string, string> = {
  pdf: "application/pdf",
  txt: "text/plain",
  md: "text/markdown",
  json: "application/json",
  csv: "text/csv",
  html: "text/html",
  htm: "text/html",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  py: "text/x-python",
  js: "text/javascript",
  ts: "text/typescript",
  zip: "application/zip",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  mp4: "video/mp4",
};

export function guessMime(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return MIME_MAP[ext] ?? "application/octet-stream";
}

/** Recursively list all files under a path */
export async function listDirRecursive(path: string): Promise<FileEntry[]> {
  const entries = await listDir(path);
  const result: FileEntry[] = [];
  for (const entry of entries) {
    result.push(entry);
    if (entry.kind === "directory") {
      const children = await listDirRecursive(entry.path);
      result.push(...children);
    }
  }
  return result;
}

/** Get total size of a directory */
export async function getDirSize(path: string): Promise<number> {
  const entries = await listDirRecursive(path);
  return entries.reduce((sum, e) => sum + (e.size ?? 0), 0);
}
