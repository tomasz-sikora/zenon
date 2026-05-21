// Gemma 4 E2B (Efficient 2B) — uses Gemma4ForCausalLM, fully supported in transformers.js v4
const DEFAULT_MODEL_ID = "onnx-community/gemma-4-E2B-it-ONNX";
function toLocalTools(tools) {
    return tools.map((t) => ({
        type: "function",
        function: {
            name: t.name,
            description: t.description,
            parameters: t.inputSchema,
        },
    }));
}
export class LocalWebGPUProvider {
    static worker = null;
    static readyModelId = null;
    static loadPromise = null;
    id;
    name;
    constructor({ id, name }) {
        this.id = id;
        this.name = name;
    }
    static getWorker() {
        if (!this.worker) {
            this.worker = new Worker(new URL("./local-webgpu.worker.ts", import.meta.url), {
                type: "module",
            });
        }
        return this.worker;
    }
    static isLoaded(modelId) {
        return this.readyModelId === modelId;
    }
    async preload(onProgress, modelId = DEFAULT_MODEL_ID) {
        if (LocalWebGPUProvider.isLoaded(modelId)) {
            onProgress({ status: "ready", progress: 100, data: "Model ready" });
            return;
        }
        if (LocalWebGPUProvider.loadPromise) {
            await LocalWebGPUProvider.loadPromise;
            onProgress({ status: "ready", progress: 100, data: "Model ready" });
            return;
        }
        const worker = LocalWebGPUProvider.getWorker();
        LocalWebGPUProvider.readyModelId = null;
        LocalWebGPUProvider.loadPromise = new Promise((resolve, reject) => {
            const handleMessage = (event) => {
                const message = event.data;
                if (message.status === "progress" || message.status === "loading") {
                    onProgress({
                        status: message.status,
                        file: message.file ?? message.name,
                        loaded: message.loaded,
                        total: message.total,
                        data: message.data,
                        progress: message.progress,
                    });
                    return;
                }
                if (message.status === "ready") {
                    LocalWebGPUProvider.readyModelId = message.modelId ?? modelId;
                    cleanup();
                    onProgress({ status: "ready", progress: 100, data: "Model ready" });
                    resolve();
                    return;
                }
                if (message.status === "error") {
                    LocalWebGPUProvider.readyModelId = null;
                    cleanup();
                    reject(new Error(message.error ?? "Failed to load local WebGPU model."));
                }
            };
            const cleanup = () => {
                worker.removeEventListener("message", handleMessage);
                LocalWebGPUProvider.loadPromise = null;
            };
            worker.addEventListener("message", handleMessage);
            worker.postMessage({ type: "load", data: { modelId } });
        });
        return LocalWebGPUProvider.loadPromise;
    }
    async complete(opts, onChunk) {
        const modelId = opts.modelId ?? DEFAULT_MODEL_ID;
        if (!LocalWebGPUProvider.isLoaded(modelId)) {
            await this.preload(() => undefined, modelId);
        }
        const worker = LocalWebGPUProvider.getWorker();
        const messages = toChatMessages(opts.messages);
        const tools = opts.tools?.length ? toLocalTools(opts.tools) : undefined;
        if (opts.signal?.aborted) {
            throw abortError();
        }
        await new Promise((resolve, reject) => {
            const handleMessage = (event) => {
                const message = event.data;
                if (message.status === "update" && message.output) {
                    onChunk({ type: "text", text: message.output });
                    return;
                }
                if (message.status === "tool_calls" && message.toolCalls?.length) {
                    for (const tc of message.toolCalls) {
                        const callId = tc.id ?? `local_${Date.now()}_${Math.random().toString(36).slice(2)}`;
                        onChunk({ type: "tool_call_start", toolCallId: callId, toolName: tc.name });
                        onChunk({
                            type: "tool_call_end",
                            toolCallId: callId,
                            toolName: tc.name,
                            toolInput: tc.arguments,
                        });
                    }
                    cleanup();
                    onChunk({ type: "done" });
                    resolve();
                    return;
                }
                if (message.status === "complete") {
                    cleanup();
                    onChunk({ type: "done" });
                    resolve();
                    return;
                }
                if (message.status === "error") {
                    cleanup();
                    reject(new Error(message.error ?? "Local WebGPU generation failed."));
                }
            };
            const abortHandler = () => {
                worker.postMessage({ type: "interrupt" });
                cleanup();
                reject(abortError());
            };
            const cleanup = () => {
                worker.removeEventListener("message", handleMessage);
                opts.signal?.removeEventListener("abort", abortHandler);
            };
            worker.addEventListener("message", handleMessage);
            opts.signal?.addEventListener("abort", abortHandler, { once: true });
            worker.postMessage({ type: "generate", data: { messages, tools } });
        });
    }
}
function abortError() {
    if (typeof DOMException !== "undefined") {
        return new DOMException("The operation was aborted.", "AbortError");
    }
    const error = new Error("The operation was aborted.");
    error.name = "AbortError";
    return error;
}
function toChatMessages(messages) {
    const result = [];
    for (const message of messages) {
        if (message.role === "tool") {
            for (const block of message.content) {
                if (block.type === "tool_result") {
                    const b = block;
                    result.push({
                        role: "tool",
                        content: b.content,
                        tool_call_id: b.toolCallId,
                        name: b.toolName,
                    });
                }
            }
            continue;
        }
        if (message.role === "assistant") {
            const toolUses = message.content.filter((b) => b.type === "tool_use");
            const textContent = message.content
                .filter((b) => b.type === "text")
                .map((b) => (b.type === "text" ? b.text : ""))
                .join("\n")
                .trim();
            if (toolUses.length > 0) {
                result.push({
                    role: "assistant",
                    content: textContent || "",
                    tool_calls: toolUses.map((tc) => ({
                        id: tc.toolCallId,
                        function: {
                            name: tc.toolName,
                            arguments: JSON.stringify(tc.toolInput),
                        },
                    })),
                });
            }
            else if (textContent) {
                result.push({ role: "assistant", content: textContent });
            }
            continue;
        }
        // user / system messages
        const content = message.content
            .filter((b) => b.type === "text")
            .map((b) => (b.type === "text" ? b.text : ""))
            .join("\n")
            .trim();
        if (content) {
            result.push({ role: message.role, content });
        }
    }
    return result;
}
export const localWebGPUProvider = new LocalWebGPUProvider({
    id: "local-webgpu",
    name: "Local (WebGPU)",
});
