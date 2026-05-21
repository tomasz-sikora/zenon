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

/** Get stats (file count + total size) for a directory */
export async function getDirStats(path: string): Promise<{ fileCount: number; totalSize: number }> {
  const entries = await listDirRecursive(path);
  const files = entries.filter((e) => e.kind === "file");
  return { fileCount: files.length, totalSize: files.reduce((s, e) => s + (e.size ?? 0), 0) };
}

// ─── Tar.gz export ────────────────────────────────────────────────────────────

function encodeTarHeader(name: string, size: number): Uint8Array {
  const header = new Uint8Array(512);
  const enc = new TextEncoder();

  function writeField(offset: number, length: number, value: string) {
    const bytes = enc.encode(value);
    header.set(bytes.slice(0, length), offset);
  }

  // Truncate/strip leading slash from name to keep it relative
  const safeName = name.replace(/^\/+/, "").slice(0, 99);
  writeField(0, 100, safeName);       // name
  writeField(100, 8, "0000644\0");    // mode
  writeField(108, 8, "0000000\0");    // uid
  writeField(116, 8, "0000000\0");    // gid
  writeField(124, 12, size.toString(8).padStart(11, "0") + "\0"); // size (octal)
  const mtime = Math.floor(Date.now() / 1000);
  writeField(136, 12, mtime.toString(8).padStart(11, "0") + "\0"); // mtime
  writeField(148, 8, "        ");     // checksum placeholder
  header[156] = 0x30;                 // type flag '0' = regular file
  writeField(257, 6, "ustar\0");      // magic
  writeField(263, 2, "00");           // version

  // Compute and write checksum
  let checksum = 0;
  for (let i = 0; i < 512; i++) checksum += header[i];
  writeField(148, 8, checksum.toString(8).padStart(6, "0") + "\0 ");

  return header;
}

/**
 * Build a .tar.gz blob from all files in a workspace directory.
 * Uses the native CompressionStream API (available in Chrome 80+, Firefox 113+).
 */
export async function createTarGz(dirPath: string): Promise<Blob> {
  const allEntries = await listDirRecursive(dirPath);
  const fileEntries = allEntries.filter((e) => e.kind === "file");

  const parts: Uint8Array[] = [];
  for (const entry of fileEntries) {
    const relPath = entry.path.startsWith(dirPath + "/")
      ? entry.path.slice(dirPath.length + 1)
      : entry.path;
    const content = await readFile(entry.path);
    const contentBytes = new Uint8Array(content);
    parts.push(encodeTarHeader(relPath, contentBytes.length));
    parts.push(contentBytes);
    // Pad to 512-byte boundary
    const remainder = contentBytes.length % 512;
    if (remainder !== 0) parts.push(new Uint8Array(512 - remainder));
  }
  // End of archive: two 512-byte zero blocks
  parts.push(new Uint8Array(1024));

  // Concatenate all parts
  const totalLength = parts.reduce((s, p) => s + p.length, 0);
  const tarBuffer = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    tarBuffer.set(part, offset);
    offset += part.length;
  }

  // Compress with gzip
  const cs = new CompressionStream("gzip");
  const writer = cs.writable.getWriter();
  writer.write(tarBuffer);
  writer.close();

  const chunks: Uint8Array[] = [];
  const reader = cs.readable.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  const compressedLength = chunks.reduce((s, c) => s + c.length, 0);
  const compressedBuffer = new Uint8Array(compressedLength);
  let pos = 0;
  for (const chunk of chunks) {
    compressedBuffer.set(chunk, pos);
    pos += chunk.length;
  }

  return new Blob([compressedBuffer], { type: "application/gzip" });
}
