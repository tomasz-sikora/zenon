import type { Message, ToolDefinition, ToolUseContent, ToolResultContent } from "@zenon/shared-types";
import type { AIProvider, CompletionOptions, StreamCallback } from "./base";

// Llama 3.2 1B Instruct — text-only, ~0.7 GB at q4f16, well-tested in the official
// transformers.js WebGPU examples; fits comfortably on a MacBook M1 / 16 GB.
const DEFAULT_MODEL_ID = "onnx-community/Llama-3.2-1B-Instruct";

type ProgressEvent = {
  status: string;
  file?: string;
  name?: string;
  loaded?: number;
  total?: number;
  data?: string;
  progress?: number;
  modelId?: string;
  output?: string;
  error?: string;
  supported?: boolean;
  toolCalls?: Array<{ name: string; arguments: Record<string, unknown>; id: string }>;
};

type EnhancedChatMessage = {
  role: string;
  content: string;
  tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
  name?: string;
};

type MistralTool = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

function toLocalTools(tools: ToolDefinition[]): MistralTool[] {
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema as Record<string, unknown>,
    },
  }));
}

export class LocalWebGPUProvider implements AIProvider {
  static worker: Worker | null = null;

  static readyModelId: string | null = null;

  static loadPromise: Promise<void> | null = null;

  id: string;

  name: string;

  constructor({ id, name }: { id: string; name: string }) {
    this.id = id;
    this.name = name;
  }

  static getWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(new URL("./local-webgpu.worker.ts", import.meta.url), {
        type: "module",
      });
    }
    return this.worker;
  }

  static isLoaded(modelId: string): boolean {
    return this.readyModelId === modelId;
  }

  async preload(
    onProgress: (msg: {
      status: string;
      file?: string;
      loaded?: number;
      total?: number;
      data?: string;
      progress?: number;
    }) => void,
    modelId: string = DEFAULT_MODEL_ID,
  ): Promise<void> {
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
    LocalWebGPUProvider.loadPromise = new Promise<void>((resolve, reject) => {
      const handleMessage = (event: MessageEvent<ProgressEvent>) => {
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

  async complete(opts: CompletionOptions, onChunk: StreamCallback): Promise<void> {
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

    await new Promise<void>((resolve, reject) => {
      const handleMessage = (event: MessageEvent<ProgressEvent>) => {
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

function abortError(): Error {
  if (typeof DOMException !== "undefined") {
    return new DOMException("The operation was aborted.", "AbortError");
  }
  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  return error;
}

function toChatMessages(messages: Message[]): EnhancedChatMessage[] {
  const result: EnhancedChatMessage[] = [];

  for (const message of messages) {
    if (message.role === "tool") {
      for (const block of message.content) {
        if (block.type === "tool_result") {
          const b = block as ToolResultContent;
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
      const toolUses = message.content.filter((b): b is ToolUseContent => b.type === "tool_use");
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
      } else if (textContent) {
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
