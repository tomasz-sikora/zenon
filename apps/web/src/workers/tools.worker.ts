/**
 * Pyodide Web Worker — runs Python code in an isolated WASM context.
 * Handles: code execution, stdout/stderr capture, micropip installs,
 * matplotlib figure capture (returns PNG as data URI).
 */

import { loadPyodide, type PyodideInterface } from "pyodide";

let pyodide: PyodideInterface | null = null;
let loading = false;
let loadError: string | null = null;

interface WorkerMessage {
  id: string;
  type: "exec" | "install";
  code?: string;
  packages?: string[];
  /** OPFS workspace files path, e.g. "workspaces/ws-id/files" — if provided, new files are reported back */
  workspaceFilesPath?: string;
}

interface WorkerResponse {
  id: string;
  type: "ready" | "result" | "error" | "stdout" | "stderr" | "installed";
  result?: unknown;
  error?: string;
  text?: string;
  figures?: string[]; // base64 PNG data URIs
  /** Files written by Python code: { filename -> base64-encoded bytes } */
  outputFiles?: Record<string, string>;
}

function post(msg: WorkerResponse) {
  self.postMessage(msg);
}

async function initPyodide() {
  if (pyodide) return pyodide;
  if (loading) {
    // Wait for load
    while (loading) {
      await new Promise((r) => setTimeout(r, 100));
    }
    if (loadError) throw new Error(loadError);
    return pyodide!;
  }
  loading = true;
  try {
    pyodide = await loadPyodide({
      indexURL: "https://cdn.jsdelivr.net/pyodide/v0.29.4/full/",
      stdout: (text: string) => post({ id: "__stream__", type: "stdout", text }),
      stderr: (text: string) => post({ id: "__stream__", type: "stderr", text }),
    });
    // Pre-install commonly needed packages
    await pyodide.loadPackagesFromImports("import micropip");
    post({ id: "__init__", type: "ready" });
    return pyodide;
  } catch (e) {
    loadError = String(e);
    throw e;
  } finally {
    loading = false;
  }
}

// Start loading immediately
initPyodide().catch((e) => {
  post({ id: "__init__", type: "error", error: String(e) });
});

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const { id, type } = event.data;

  try {
    const py = await initPyodide();

    if (type === "install") {
      const packages = event.data.packages ?? [];
      await py.runPythonAsync(`
import micropip
await micropip.install(${JSON.stringify(packages)})
      `);
      post({ id, type: "installed" });
      return;
    }

    if (type === "exec") {
      const code = event.data.code ?? "";

      await py.loadPackagesFromImports(code);

      // Set up matplotlib to use Agg backend (non-interactive, outputs PNG)
      const setupCode = `
import sys
import io

# Redirect for figure capture
_zenon_figures = []

try:
  import matplotlib
  matplotlib.use('Agg')
  import matplotlib.pyplot as plt
  _original_show = plt.show
  def _zenon_show(*args, **kwargs):
    buf = io.BytesIO()
    plt.savefig(buf, format='png', dpi=100, bbox_inches='tight')
    buf.seek(0)
    import base64
    _zenon_figures.append('data:image/png;base64,' + base64.b64encode(buf.read()).decode())
    plt.clf()
  plt.show = _zenon_show
except ImportError:
  pass
`;

      await py.runPythonAsync(setupCode);

      type PyFS = {
        readdir(p: string): string[];
        stat(p: string): { mode: number };
        isDir(mode: number): boolean;
        readFile(p: string): Uint8Array;
      };

      /** Recursively collect all file paths (not dirs) under `dir`, relative to `base`. */
      function collectFilePaths(fs: PyFS, dir: string, base: string, out: Set<string>) {
        let entries: string[];
        try { entries = fs.readdir(dir); } catch { return; }
        for (const entry of entries) {
          if (entry === "." || entry === "..") continue;
          const full = `${dir}/${entry}`;
          const rel = base ? `${base}/${entry}` : entry;
          try {
            const stat = fs.stat(full);
            if (fs.isDir(stat.mode)) {
              collectFilePaths(fs, full, rel, out);
            } else {
              out.add(rel);
            }
          } catch { /* skip unreadable */ }
        }
      }

      // Snapshot all file paths under Pyodide CWD before execution
      const pyodideCwd = "/home/pyodide";
      const pyFS = (py as unknown as { FS: PyFS }).FS;
      const beforeFiles = new Set<string>();
      collectFilePaths(pyFS, pyodideCwd, "", beforeFiles);

      // Execute user code
      const result = await py.runPythonAsync(code);

      // Collect new files written by Python (recursive, preserves subdir structure)
      const outputFiles: Record<string, string> = {};
      try {
        const afterFiles = new Set<string>();
        collectFilePaths(pyFS, pyodideCwd, "", afterFiles);
        for (const relPath of afterFiles) {
          if (!beforeFiles.has(relPath)) {
            try {
              const bytes = pyFS.readFile(`${pyodideCwd}/${relPath}`);
              // Convert Uint8Array to base64
              let binary = "";
              for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
              outputFiles[relPath] = btoa(binary);
            } catch { /* skip unreadable */ }
          }
        }
      } catch {
        /* best-effort */
      }

      // Collect any matplotlib figures
      const figuresPyObj = py.globals.get("_zenon_figures");
      const figures: string[] = figuresPyObj ? figuresPyObj.toJs() : [];
      figuresPyObj?.destroy();

      // Convert result to JS
      let jsResult: unknown = undefined;
      if (result !== undefined && result !== null) {
        try {
          jsResult =
            typeof result.toJs === "function"
              ? result.toJs({ dict_converter: Object.fromEntries })
              : String(result);
          if (typeof result.destroy === "function") result.destroy();
        } catch {
          jsResult = String(result);
        }
      }

      post({ id, type: "result", result: jsResult, figures, outputFiles });
    }
  } catch (e) {
    post({ id, type: "error", error: e instanceof Error ? e.message : String(e) });
  }
};
