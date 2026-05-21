/**
 * OPFS storage layer unit tests.
 * Uses the in-memory OPFS mock from src/test/setup.ts.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  writeFile,
  readFile,
  readFileText,
  deleteFile,
  ensureDir,
  listDir,
  listDirRecursive,
  getDirStats,
  fileExists,
  createTarGz,
} from "@/lib/storage/opfs";

describe("OPFS storage layer", () => {
  describe("writeFile / readFile", () => {
    it("writes and reads text content", async () => {
      await writeFile("workspaces/ws1/files/hello.txt", "Hello, World!");
      const text = await readFileText("workspaces/ws1/files/hello.txt");
      expect(text).toBe("Hello, World!");
    });

    it("writes and reads binary content", async () => {
      const data = new Uint8Array([1, 2, 3, 4, 5]);
      await writeFile("workspaces/ws1/files/bin.dat", data.buffer);
      const buf = await readFile("workspaces/ws1/files/bin.dat");
      expect(new Uint8Array(buf)).toEqual(data);
    });

    it("overwrites existing file", async () => {
      await writeFile("workspaces/ws1/files/a.txt", "first");
      await writeFile("workspaces/ws1/files/a.txt", "second");
      expect(await readFileText("workspaces/ws1/files/a.txt")).toBe("second");
    });
  });

  describe("deleteFile", () => {
    it("removes a file", async () => {
      await writeFile("workspaces/ws1/files/del.txt", "bye");
      expect(await fileExists("workspaces/ws1/files/del.txt")).toBe(true);
      await deleteFile("workspaces/ws1/files/del.txt");
      expect(await fileExists("workspaces/ws1/files/del.txt")).toBe(false);
    });
  });

  describe("listDir", () => {
    it("lists files in a directory", async () => {
      await ensureDir("workspaces/ws2/files");
      await writeFile("workspaces/ws2/files/a.txt", "a");
      await writeFile("workspaces/ws2/files/b.csv", "b");
      const entries = await listDir("workspaces/ws2/files");
      const names = entries.map((e) => e.name);
      expect(names).toContain("a.txt");
      expect(names).toContain("b.csv");
    });

    it("assigns correct mime types", async () => {
      await ensureDir("workspaces/ws2/files");
      await writeFile("workspaces/ws2/files/img.png", "fake-png");
      const entries = await listDir("workspaces/ws2/files");
      const png = entries.find((e) => e.name === "img.png");
      expect(png?.mimeType).toBe("image/png");
    });
  });

  describe("listDirRecursive", () => {
    it("lists nested files", async () => {
      await ensureDir("workspaces/ws3/files/sub");
      await writeFile("workspaces/ws3/files/root.txt", "r");
      await writeFile("workspaces/ws3/files/sub/child.txt", "c");
      const entries = await listDirRecursive("workspaces/ws3/files");
      const names = entries.map((e) => e.name);
      expect(names).toContain("root.txt");
      expect(names).toContain("child.txt");
    });
  });

  describe("getDirStats", () => {
    it("returns file count and total size", async () => {
      await ensureDir("workspaces/ws4/files");
      await writeFile("workspaces/ws4/files/a.txt", "hello");   // 5 bytes
      await writeFile("workspaces/ws4/files/b.txt", "world!"); // 6 bytes
      const stats = await getDirStats("workspaces/ws4/files");
      expect(stats.fileCount).toBe(2);
      expect(stats.totalSize).toBe(11);
    });

    it("returns zeros for empty directory", async () => {
      await ensureDir("workspaces/ws5/files");
      const stats = await getDirStats("workspaces/ws5/files");
      expect(stats.fileCount).toBe(0);
      expect(stats.totalSize).toBe(0);
    });
  });

  describe("createTarGz", () => {
    it("creates a non-empty blob from a directory with files", async () => {
      await ensureDir("workspaces/ws6/files");
      await writeFile("workspaces/ws6/files/data.txt", "some content");
      await writeFile("workspaces/ws6/files/script.py", 'print("hello")');
      const blob = await createTarGz("workspaces/ws6/files");
      expect(blob.size).toBeGreaterThan(0);
      expect(blob.type).toBe("application/gzip");
    });

    it("creates a small blob for an empty directory", async () => {
      await ensureDir("workspaces/ws7/files");
      const blob = await createTarGz("workspaces/ws7/files");
      // Empty archive is still non-zero (two 512-byte end blocks)
      expect(blob.size).toBeGreaterThan(0);
    });
  });
});
