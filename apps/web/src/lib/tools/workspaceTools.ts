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

toolRegistry.register({
  name: "read_file",
  description:
    "Read the text content of a file from the workspace. Returns the file content as a string.",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Path to the file within the workspace (e.g. 'workspaces/ws-id/files/data.csv')",
      },
    },
    required: ["path"],
  },
  execute: async (args: Record<string, unknown>) => {
    const path = args["path"] as string;
    const text = await readFileText(path);
    return { content: text, path, length: text.length };
  },
});

toolRegistry.register({
  name: "write_file",
  description: "Write text content to a file in the workspace. Creates the file if it doesn't exist.",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Path where the file will be written",
      },
      content: {
        type: "string",
        description: "Text content to write",
      },
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
  description:
    "List files and directories at a given workspace path. Returns an array of file entries with name, type, and size.",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Directory path to list (e.g. 'workspaces/ws-id/files')",
      },
      recursive: {
        type: "boolean",
        description: "If true, recursively list all files in subdirectories",
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
      path: {
        type: "string",
        description: "Path to the file to delete",
      },
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
  description: "Append text to an existing file in the workspace. Creates the file if it doesn't exist.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Path to the file" },
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
