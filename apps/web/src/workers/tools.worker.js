/**
 * Pyodide Web Worker — runs Python code in an isolated WASM context.
 * Handles: code execution, stdout/stderr capture, micropip installs,
 * matplotlib figure capture (returns PNG as data URI).
 */
import { loadPyodide } from "pyodide";
let pyodide = null;
let loading = false;
let loadError = null;
function post(msg) {
    self.postMessage(msg);
}
async function initPyodide() {
    if (pyodide)
        return pyodide;
    if (loading) {
        // Wait for load
        while (loading) {
            await new Promise((r) => setTimeout(r, 100));
        }
        if (loadError)
            throw new Error(loadError);
        return pyodide;
    }
    loading = true;
    try {
        pyodide = await loadPyodide({
            indexURL: "https://cdn.jsdelivr.net/pyodide/v0.29.4/full/",
            stdout: (text) => post({ id: "__stream__", type: "stdout", text }),
            stderr: (text) => post({ id: "__stream__", type: "stderr", text }),
        });
        // Pre-install commonly needed packages
        await pyodide.loadPackagesFromImports("import micropip");
        post({ id: "__init__", type: "ready" });
        return pyodide;
    }
    catch (e) {
        loadError = String(e);
        throw e;
    }
    finally {
        loading = false;
    }
}
// Start loading immediately
initPyodide().catch((e) => {
    post({ id: "__init__", type: "error", error: String(e) });
});
self.onmessage = async (event) => {
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
            // Execute user code
            const result = await py.runPythonAsync(code);
            // Collect any matplotlib figures
            const figuresPyObj = py.globals.get("_zenon_figures");
            const figures = figuresPyObj ? figuresPyObj.toJs() : [];
            figuresPyObj?.destroy();
            // Convert result to JS
            let jsResult = undefined;
            if (result !== undefined && result !== null) {
                try {
                    jsResult =
                        typeof result.toJs === "function"
                            ? result.toJs({ dict_converter: Object.fromEntries })
                            : String(result);
                    if (typeof result.destroy === "function")
                        result.destroy();
                }
                catch {
                    jsResult = String(result);
                }
            }
            post({ id, type: "result", result: jsResult, figures });
        }
    }
    catch (e) {
        post({ id, type: "error", error: e instanceof Error ? e.message : String(e) });
    }
};
