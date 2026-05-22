/**
 * Workspace file tools — OPFS-backed read/write/list/delete tools
 * accessible to the agent runtime.
 */

import { toolRegistry } from "./registry";
import {
  readFileText,
  writeFile,
  deleteFile,
  listDir,
  listDirRecursive,
  guessMime,
} from "@/lib/storage/opfs";

const MAX_READ_CHARS = 8000;

function truncateFileContent(text: string): string {
  if (text.length <= MAX_READ_CHARS) return text;
  return text.slice(0, MAX_READ_CHARS) + `\n... [truncated — ${text.length} chars total, showing first ${MAX_READ_CHARS}. Use python_exec to process large files]`;
}

toolRegistry.register({
  name: "read_file",
  description:
    "Read a text file from the workspace. Returns truncated content for large files — use python_exec for full processing. " +
    "IMPORTANT: Do NOT use this to read files and then pass content to python_exec — instead use Python's open() directly.",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Full workspace path (e.g. 'workspaces/ws-id/files/data.csv')",
      },
    },
    required: ["path"],
  },
  execute: async (args: Record<string, unknown>) => {
    const path = args["path"] as string;
    const text = await readFileText(path);
    return { content: truncateFileContent(text), path, length: text.length };
  },
});

toolRegistry.register({
  name: "write_file",
  description: "Write text to a workspace file. Creates or overwrites the file.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Workspace file path" },
      content: { type: "string", description: "Text content to write" },
    },
    required: ["path", "content"],
  },
  execute: async (args: Record<string, unknown>) => {
    const path = args["path"] as string;
    const content = args["content"] as string;
    await writeFile(path, content);
    return { success: true, path, bytes: new TextEncoder().encode(content).length };
  },
});

toolRegistry.register({
  name: "list_files",
  description: "List files and directories at a workspace path.",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Directory path (e.g. 'workspaces/ws-id/files')",
      },
      recursive: {
        type: "boolean",
        description: "List all files recursively (default: false)",
        default: false,
      },
    },
    required: ["path"],
  },
  execute: async (args: Record<string, unknown>) => {
    const path = args["path"] as string;
    const recursive = args["recursive"] as boolean | undefined;
    const entries = recursive ? await listDirRecursive(path) : await listDir(path);
    return { entries, count: entries.length };
  },
});

toolRegistry.register({
  name: "delete_file",
  description: "Delete a file from the workspace.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Path to delete" },
    },
    required: ["path"],
  },
  execute: async (args: Record<string, unknown>) => {
    const path = args["path"] as string;
    await deleteFile(path);
    return { success: true, path };
  },
});

toolRegistry.register({
  name: "append_file",
  description: "Append text to a workspace file. Creates the file if it doesn't exist.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path" },
      content: { type: "string", description: "Text to append" },
    },
    required: ["path", "content"],
  },
  execute: async (args: Record<string, unknown>) => {
    const path = args["path"] as string;
    const append = args["content"] as string;
    let existing = "";
    try {
      existing = await readFileText(path);
    } catch {
      // file doesn't exist yet
    }
    const combined = existing + append;
    await writeFile(path, combined);
    return { success: true, path, totalBytes: new TextEncoder().encode(combined).length };
  },
});

export { guessMime };
