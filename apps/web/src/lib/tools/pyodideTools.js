/**
 * Pyodide bridge — communicates with the tools Web Worker to execute Python code.
 */
import { toolRegistry } from "./registry";
let worker = null;
let workerReady = false;
let workerError = null;
const pending = new Map();
let requestCounter = 0;
function getWorker() {
    if (!worker) {
        worker = new Worker(new URL("../../workers/tools.worker.ts", import.meta.url), {
            type: "module",
        });
        worker.onmessage = (event) => {
            const msg = event.data;
            if (msg.id === "__init__") {
                if (msg.type === "ready")
                    workerReady = true;
                if (msg.type === "error")
                    workerError = msg.error ?? "Unknown error";
                return;
            }
            if (msg.id === "__stream__") {
                // Stream stdout/stderr to any currently running request (last pending)
                const lastId = [...pending.keys()].at(-1);
                if (lastId) {
                    const req = pending.get(lastId);
                    if (msg.type === "stdout")
                        req.stdout.push(msg.text ?? "");
                    if (msg.type === "stderr")
                        req.stderr.push(msg.text ?? "");
                }
                return;
            }
            const req = pending.get(msg.id);
            if (!req)
                return;
            if (msg.type === "result") {
                if (msg.figures)
                    req.figures.push(...msg.figures);
                req.resolve({ result: msg.result, stdout: req.stdout.join(""), stderr: req.stderr.join(""), figures: req.figures });
                pending.delete(msg.id);
            }
            else if (msg.type === "installed") {
                req.resolve({ success: true });
                pending.delete(msg.id);
            }
            else if (msg.type === "error") {
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
async function waitForReady(timeoutMs = 30000) {
    const start = Date.now();
    while (!workerReady) {
        if (workerError)
            throw new Error(`Pyodide failed to load: ${workerError}`);
        if (Date.now() - start > timeoutMs)
            throw new Error("Pyodide timed out loading");
        await new Promise((r) => setTimeout(r, 200));
    }
}
async function execPython(code) {
    const w = getWorker();
    await waitForReady();
    const id = `req-${++requestCounter}`;
    return new Promise((resolve, reject) => {
        pending.set(id, { resolve: resolve, reject, stdout: [], stderr: [], figures: [] });
        w.postMessage({ id, type: "exec", code });
    });
}
async function installPackages(packages) {
    const w = getWorker();
    await waitForReady();
    const id = `install-${++requestCounter}`;
    await new Promise((resolve, reject) => {
        pending.set(id, { resolve: resolve, reject, stdout: [], stderr: [], figures: [] });
        w.postMessage({ id, type: "install", packages });
    });
}
const pythonExecTool = {
    name: "python_exec",
    description: "Execute Python code using Pyodide (WASM Python interpreter running in the browser). " +
        "Supports standard library, numpy, pandas, matplotlib, scipy, and micropip for additional packages. " +
        "Use print() for output. matplotlib.pyplot.show() saves figures as images. " +
        "Returns stdout, stderr, any printed result, and base64-encoded PNG figures.",
    inputSchema: {
        type: "object",
        properties: {
            code: {
                type: "string",
                description: "Python code to execute",
            },
        },
        required: ["code"],
    },
    execute: async (args) => {
        const code = args["code"];
        const { result, stdout, stderr, figures } = await execPython(code);
        const output = {};
        if (stdout)
            output["stdout"] = stdout;
        if (stderr)
            output["stderr"] = stderr;
        if (result !== undefined && result !== null)
            output["result"] = result;
        if (figures.length > 0)
            output["figures"] = figures;
        return output;
    },
};
const pipInstallTool = {
    name: "pip_install",
    description: "Install Python packages using micropip (Pyodide's package manager). " +
        "Use this before importing packages that aren't available by default.",
    inputSchema: {
        type: "object",
        properties: {
            packages: {
                type: "array",
                items: { type: "string" },
                description: "List of package names to install",
            },
        },
        required: ["packages"],
    },
    execute: async (args) => {
        const packages = args["packages"];
        await installPackages(packages);
        return { installed: packages };
    },
};
toolRegistry.register(pythonExecTool);
toolRegistry.register(pipInstallTool);
export { execPython, installPackages };
