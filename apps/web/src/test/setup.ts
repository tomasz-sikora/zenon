import "@testing-library/jest-dom";

// ─── OPFS mock ────────────────────────────────────────────────────────────────
// Simulates the Origin Private File System in jsdom (which has no real OPFS).

type MemEntry = { kind: "file"; data: Uint8Array; lastModified: number } | { kind: "dir" };
const memFS = new Map<string, MemEntry>();

function normPath(p: string) {
  return p.replace(/\/+/g, "/").replace(/\/$/, "");
}

// Polyfill navigator.storage.getDirectory with an in-memory implementation
Object.defineProperty(global.navigator, "storage", {
  value: {
    getDirectory: async () => makeHandle(""),
  },
  writable: true,
});

function makeHandle(basePath: string): FileSystemDirectoryHandle {
  return {
    kind: "directory",
    name: basePath.split("/").pop() || "",
    getDirectoryHandle: async (name: string, opts?: { create?: boolean }) => {
      const p = normPath(`${basePath}/${name}`);
      if (!memFS.has(p)) {
        if (!opts?.create) throw new Error(`NotFoundError: ${p}`);
        memFS.set(p, { kind: "dir" });
      }
      return makeHandle(p);
    },
    getFileHandle: async (name: string, opts?: { create?: boolean }) => {
      const p = normPath(`${basePath}/${name}`);
      if (!memFS.has(p)) {
        if (!opts?.create) throw new Error(`NotFoundError: ${p}`);
        memFS.set(p, { kind: "file", data: new Uint8Array(), lastModified: Date.now() });
      }
      const entry = memFS.get(p)!;
      if (entry.kind !== "file") throw new Error(`TypeMismatchError: ${p}`);
      return {
        kind: "file",
        name,
        getFile: async () => {
          const e = memFS.get(p) as { kind: "file"; data: Uint8Array; lastModified: number };
          return new File([e.data as BlobPart], name, { lastModified: e.lastModified });
        },
        createWritable: async () => {
          let buf = new Uint8Array();
          return {
            write: async (chunk: ArrayBuffer | Uint8Array | string) => {
              let bytes: Uint8Array;
              if (typeof chunk === "string") bytes = new TextEncoder().encode(chunk);
              else if (chunk instanceof ArrayBuffer) bytes = new Uint8Array(chunk);
              else bytes = chunk;
              const merged = new Uint8Array(buf.length + bytes.length);
              merged.set(buf);
              merged.set(bytes, buf.length);
              buf = merged;
            },
            close: async () => {
              memFS.set(p, { kind: "file", data: buf, lastModified: Date.now() });
            },
          };
        },
      } as unknown as FileSystemFileHandle;
    },
    removeEntry: async (name: string, opts?: { recursive?: boolean }) => {
      const p = normPath(`${basePath}/${name}`);
      if (opts?.recursive) {
        for (const key of memFS.keys()) {
          if (key === p || key.startsWith(p + "/")) memFS.delete(key);
        }
      } else {
        memFS.delete(p);
      }
    },
    [Symbol.asyncIterator]: async function* () {
      const prefix = basePath ? normPath(basePath) + "/" : "";
      for (const [key, val] of memFS.entries()) {
        if (!key.startsWith(prefix)) continue;
        const rest = key.slice(prefix.length);
        if (!rest || rest.includes("/")) continue;
        if (val.kind === "file") {
          const fh = await makeHandle(basePath).getFileHandle(rest);
          yield [rest, fh] as [string, FileSystemFileHandle];
        } else {
          yield [rest, makeHandle(key)] as [string, FileSystemDirectoryHandle];
        }
      }
    },
  } as unknown as FileSystemDirectoryHandle;
}

// Polyfill CompressionStream (not in jsdom)
if (typeof globalThis.CompressionStream === "undefined") {
  // Minimal no-op gzip shim: just passes data through uncompressed (good enough for tests)
  globalThis.CompressionStream = class {
    readonly writable: WritableStream;
    readonly readable: ReadableStream;
    constructor(_format: string) {
      const chunks: Uint8Array[] = [];
      let resolve: () => void;
      const done = new Promise<void>((r) => { resolve = r; });
      this.writable = new WritableStream({
        write(chunk) { chunks.push(chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk)); },
        close() { resolve(); },
      });
      this.readable = new ReadableStream({
        async start(controller) {
          await done;
          for (const chunk of chunks) controller.enqueue(chunk);
          controller.close();
        },
      });
    }
  } as unknown as typeof CompressionStream;
}

// Reset FS between tests
import { afterEach } from "vitest";
afterEach(() => {
  memFS.clear();
});
