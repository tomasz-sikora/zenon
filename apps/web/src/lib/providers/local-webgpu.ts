import type { Message, ToolUseContent, ToolResultContent } from "@zenon/shared-types";
import type { AIProvider, CompletionOptions, StreamCallback } from "./base";

const MODEL_ID = "mistralai/Ministral-3-3B-Instruct-2512-ONNX";

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

export class LocalWebGPUProvider implements AIProvider {
  static worker: Worker | null = null;

  static isModelLoaded = false;

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

  static isLoaded(): boolean {
    return this.isModelLoaded;
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
  ): Promise<void> {
    if (LocalWebGPUProvider.isLoaded()) {
      onProgress({ status: "ready", progress: 100, data: "Model ready" });
      return;
    }

    if (LocalWebGPUProvider.loadPromise) {
      await LocalWebGPUProvider.loadPromise;
      onProgress({ status: "ready", progress: 100, data: "Model ready" });
      return;
    }

    const worker = LocalWebGPUProvider.getWorker();
    LocalWebGPUProvider.isModelLoaded = false;
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
          LocalWebGPUProvider.isModelLoaded = true;
          cleanup();
          onProgress({ status: "ready", progress: 100, data: "Model ready" });
          resolve();
          return;
        }

        if (message.status === "error") {
          LocalWebGPUProvider.isModelLoaded = false;
          cleanup();
          reject(new Error(message.error ?? "Failed to load local WebGPU model."));
        }
      };

      const cleanup = () => {
        worker.removeEventListener("message", handleMessage);
        LocalWebGPUProvider.loadPromise = null;
      };

      worker.addEventListener("message", handleMessage);
      worker.postMessage({ type: "load" });
    });

    return LocalWebGPUProvider.loadPromise;
  }

  async complete(opts: CompletionOptions, onChunk: StreamCallback): Promise<void> {
    if (!LocalWebGPUProvider.isLoaded()) {
      await this.preload(() => undefined);
    }

    const worker = LocalWebGPUProvider.getWorker();
    const messages = toChatMessages(opts.messages);

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
      worker.postMessage({ type: "generate", data: { messages } });
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
