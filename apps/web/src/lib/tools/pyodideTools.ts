/**
 * Pyodide bridge — communicates with the tools Web Worker to execute Python code.
 */

import type { SimpleToolRegistration } from "./registry";
import { toolRegistry } from "./registry";
import { writeFile } from "@/lib/storage/opfs";
import { useWorkspaceStore } from "@/store/workspaceStore";
import { workspacePaths } from "@/lib/storage/workspace";

interface PendingRequest {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  stdout: string[];
  stderr: string[];
  figures: string[];
}

let worker: Worker | null = null;
let workerReady = false;
let workerError: string | null = null;
const pending = new Map<string, PendingRequest>();
let requestCounter = 0;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("../../workers/tools.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (event) => {
      const msg = event.data as {
        id: string;
        type: string;
        result?: unknown;
        error?: string;
        text?: string;
        figures?: string[];
        outputFiles?: Record<string, string>;
      };

      if (msg.id === "__init__") {
        if (msg.type === "ready") workerReady = true;
        if (msg.type === "error") workerError = msg.error ?? "Unknown error";
        return;
      }

      if (msg.id === "__stream__") {
        // Stream stdout/stderr to any currently running request (last pending)
        const lastId = [...pending.keys()].at(-1);
        if (lastId) {
          const req = pending.get(lastId)!;
          if (msg.type === "stdout") req.stdout.push(msg.text ?? "");
          if (msg.type === "stderr") req.stderr.push(msg.text ?? "");
        }
        return;
      }

      const req = pending.get(msg.id);
      if (!req) return;

      if (msg.type === "result") {
        if (msg.figures) req.figures.push(...msg.figures);
        // Persist files written by Python to the active workspace OPFS directory
        if (msg.outputFiles && Object.keys(msg.outputFiles).length > 0) {
          const wsId = useWorkspaceStore.getState().currentWorkspaceId;
          if (wsId) {
            const filesDir = workspacePaths.files(wsId);
            for (const [filename, b64] of Object.entries(msg.outputFiles)) {
              const binary = atob(b64);
              const bytes = new Uint8Array(binary.length);
              for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
              // best-effort write; don't block the result
              writeFile(`${filesDir}/${filename}`, bytes.buffer).catch(() => {});
            }
          }
        }
        req.resolve({
          result: msg.result,
          stdout: req.stdout.join(""),
          stderr: req.stderr.join(""),
          figures: req.figures,
          outputFiles: msg.outputFiles ?? {},
        });
        pending.delete(msg.id);
      } else if (msg.type === "installed") {
        req.resolve({ success: true });
        pending.delete(msg.id);
      } else if (msg.type === "error") {
        req.reject(new Error(msg.error ?? "Unknown error"));
        pending.delete(msg.id);
      }
    };
    worker.onerror = (e) => {
      workerError = e.message;
      for (const [, req] of pending) {
        req.reject(new Error(e.message));
      }
      pending.clear();
    };
  }
  return worker;
}

async function waitForReady(timeoutMs = 120_000): Promise<void> {
  const start = Date.now();
  while (!workerReady) {
    if (workerError) throw new Error(`Pyodide failed to load: ${workerError}`);
    if (Date.now() - start > timeoutMs) throw new Error("Pyodide timed out loading");
    await new Promise((r) => setTimeout(r, 200));
  }
}

const EXEC_TIMEOUT_MS = 120_000; // 2 minutes per execution

async function execPython(code: string): Promise<{
  result: unknown;
  stdout: string;
  stderr: string;
  figures: string[];
  outputFiles: Record<string, string>;
  [key: string]: unknown;
}> {
  const w = getWorker();
  await waitForReady();
  const id = `req-${++requestCounter}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error("Python execution timed out after 2 minutes"));
    }, EXEC_TIMEOUT_MS);
    pending.set(id, {
      resolve: (v: unknown) => { clearTimeout(timer); (resolve as (v: unknown) => void)(v); },
      reject: (e: Error) => { clearTimeout(timer); reject(e); },
      stdout: [], stderr: [], figures: [],
    });
    w.postMessage({ id, type: "exec", code });
  }) as Promise<{ result: unknown; stdout: string; stderr: string; figures: string[]; outputFiles: Record<string, string> }>;
}

async function installPackages(packages: string[]): Promise<void> {
  const w = getWorker();
  await waitForReady();
  const id = `install-${++requestCounter}`;
  await new Promise<void>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject, stdout: [], stderr: [], figures: [] });
    w.postMessage({ id, type: "install", packages });
  });
}

const MAX_TOOL_OUTPUT_CHARS = 8000;

function truncateOutput(text: string, label = "output"): string {
  if (text.length <= MAX_TOOL_OUTPUT_CHARS) return text;
  return text.slice(0, MAX_TOOL_OUTPUT_CHARS) + `\n... [${label} truncated — ${text.length} chars total, showing first ${MAX_TOOL_OUTPUT_CHARS}]`;
}

const pythonExecTool: SimpleToolRegistration = {
  name: "python_exec",
  description:
    "Run Python code in the browser via Pyodide (WASM). " +
    "Pre-installed: numpy, pandas, matplotlib, scipy. Use pip_install for others. " +
    "Use print() for output. plt.show() captures charts as PNG. " +
    "Files written to relative paths (e.g. open('out.csv','w')) auto-save to workspace. " +
    "IMPORTANT: Do NOT pass file content as code argument — use read_file tool first, then reference data in code.",
  inputSchema: {
    type: "object",
    properties: {
      code: {
        type: "string",
        description: "Python source code to execute",
      },
    },
    required: ["code"],
  },
  execute: async (args: Record<string, unknown>) => {
    const code = args["code"] as string;
    const { result, stdout, stderr, figures, outputFiles } = await execPython(code);

    const output: Record<string, unknown> = {};
    if (stdout) output["stdout"] = truncateOutput(stdout, "stdout");
    if (stderr) output["stderr"] = truncateOutput(stderr, "stderr");
    if (result !== undefined && result !== null) {
      const resultStr = typeof result === "string" ? result : JSON.stringify(result);
      output["result"] = truncateOutput(resultStr, "result");
    }
    if (figures.length > 0) output["figures"] = figures;
    const fileNames = Object.keys(outputFiles);
    if (fileNames.length > 0) output["files_saved_to_workspace"] = fileNames;

    return output;
  },
};

const pipInstallTool: SimpleToolRegistration = {
  name: "pip_install",
  description: "Install Python packages via micropip before importing them in python_exec.",
  inputSchema: {
    type: "object",
    properties: {
      packages: {
        type: "array",
        items: { type: "string" },
        description: "Package names to install (e.g. ['requests', 'beautifulsoup4'])",
      },
    },
    required: ["packages"],
  },
  execute: async (args: Record<string, unknown>) => {
    const packages = args["packages"] as string[];
    await installPackages(packages);
    return { installed: packages };
  },
};

toolRegistry.register(pythonExecTool);
toolRegistry.register(pipInstallTool);

export { execPython, installPackages };
