import {
  AutoModelForCausalLM,
  AutoTokenizer,
  InterruptableStoppingCriteria,
  TextStreamer,
  env,
} from "@huggingface/transformers";

// When VITE_LOCAL_MODEL_BASE_URL is set (Docker image with pre-fetched models),
// resolve models from that local static path instead of downloading from HuggingFace.
// The variable is baked in at Vite build time; the worker only ever runs in one mode.
const LOCAL_MODEL_BASE = (import.meta.env.VITE_LOCAL_MODEL_BASE_URL as string | undefined)
  ?.replace(/\/+$/, ""); // strip any trailing slash
if (LOCAL_MODEL_BASE) {
  // allowLocalModels defaults to false in web-worker environments; enable it
  // explicitly so transformers.js checks the static /models/ path before
  // falling back to the HuggingFace Hub (which is disabled in Docker).
  env.allowLocalModels = true;
  env.allowRemoteModels = false;
}

// Llama 3.2 1B Instruct — text-only, well-tested in the official
// `transformers.js` WebGPU examples. Fits comfortably on a MacBook M1 / 16 GB.
// The base repo (without the -q4f16 suffix) ships both model_q4.onnx and
// model_q4f16.onnx; the worker picks the right variant at runtime based on
// whether the WebGPU adapter supports the shader-f16 extension.
const DEFAULT_MODEL_ID = "onnx-community/Llama-3.2-1B-Instruct";

/** A message suitable for Mistral's chat template */
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

type ParsedToolCall = {
  name: string;
  arguments: Record<string, unknown>;
  id: string;
};

type ProgressMessage = {
  status?: string;
  file?: string;
  name?: string;
  loaded?: number;
  total?: number;
  progress?: number;
};

type WorkerRequest =
  | { type: "check" }
  | { type: "load"; data?: { modelId?: string } }
  | { type: "generate"; data: { messages: EnhancedChatMessage[]; tools?: MistralTool[] } }
  | { type: "interrupt" }
  | { type: "reset" };

type WorkerResponse =
  | { status: "check"; supported: boolean }
  | { status: "loading"; data?: string }
  | { status: "progress"; file?: string; name?: string; loaded?: number; total?: number; progress?: number }
  | { status: "ready"; modelId: string }
  | { status: "update"; output: string }
  | { status: "tool_calls"; toolCalls: ParsedToolCall[] }
  | { status: "complete" }
  | { status: "error"; error: string };

type LoadedPipeline = {
  tokenizer: Awaited<ReturnType<typeof AutoTokenizer.from_pretrained>>;
  model: Awaited<ReturnType<typeof AutoModelForCausalLM.from_pretrained>>;
};

let pipelinePromise: Promise<LoadedPipeline> | null = null;
let pipelineInstance: LoadedPipeline | null = null;
let currentModelId = DEFAULT_MODEL_ID;
const stoppingCriteria = new InterruptableStoppingCriteria();

function post(message: WorkerResponse) {
  self.postMessage(message);
}

function isWebGPUSupported(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function progressCallback(progress: ProgressMessage) {
  post({
    status: "progress",
    file: progress.file,
    name: progress.name,
    loaded: progress.loaded,
    total: progress.total,
    progress: progress.progress,
  });
}

async function loadModel(modelId = DEFAULT_MODEL_ID): Promise<LoadedPipeline> {
  if (!isWebGPUSupported()) {
    throw new Error("WebGPU is not supported in this browser.");
  }

  if (pipelineInstance && currentModelId === modelId) {
    return pipelineInstance;
  }

  if (pipelinePromise && currentModelId === modelId) {
    return pipelinePromise;
  }

  if (currentModelId !== modelId) {
    pipelineInstance = null;
    pipelinePromise = null;
  }

  currentModelId = modelId;
  post({ status: "loading", data: `Loading ${modelId}…` });

  // Resolve from pre-fetched static assets when available, otherwise fall back
  // to the HuggingFace Hub (dev / non-Docker environments).
  const resolvedId = LOCAL_MODEL_BASE
    ? `${LOCAL_MODEL_BASE}/${modelId.replace(/^\/+/, "")}`
    : modelId;

  pipelinePromise = (async () => {
    const tokenizer = await AutoTokenizer.from_pretrained(resolvedId, {
      progress_callback: progressCallback,
    });

    // transformers.js 4.x defaults text-generation to dtype:'q4' for good reason:
    // q4 uses 4-bit weights with float32 activations — no shader-f16 required.
    // q4f16 additionally uses float16 for activations AND the KV cache, which
    // requires the WebGPU shader-f16 extension and fails on many GPUs/drivers
    // with "Unsupported tensor type: float16".
    const model = await AutoModelForCausalLM.from_pretrained(resolvedId, {
      dtype: "q4",
      device: "webgpu",
      progress_callback: progressCallback,
    } as Parameters<typeof AutoModelForCausalLM.from_pretrained>[1]);

    const loaded = { tokenizer, model };
    pipelineInstance = loaded;

    post({ status: "loading", data: "Warming up model…" });
    const warmupInputs = tokenizer.apply_chat_template(
      [{ role: "user", content: "Hello" }],
      { add_generation_prompt: true, return_dict: true },
    );
    stoppingCriteria.reset();
    await model.generate({
      ...warmupInputs,
      max_new_tokens: 1,
      do_sample: false,
      stopping_criteria: stoppingCriteria,
    });

    post({ status: "ready", modelId });
    return loaded;
  })();

  try {
    return await pipelinePromise;
  } catch (error) {
    pipelineInstance = null;
    pipelinePromise = null;
    throw error;
  }
}

function parseToolCalls(output: string): ParsedToolCall[] {
  // Qwen2.5 / Llama 3.2 format: <tool_call>{"name": "...", "arguments": {...}}</tool_call>
  const qwenMatches = [...output.matchAll(/<tool_call>([\s\S]*?)<\/tool_call>/g)];
  if (qwenMatches.length > 0) {
    const calls: ParsedToolCall[] = [];
    for (let i = 0; i < qwenMatches.length; i++) {
      try {
        const parsed: unknown = JSON.parse(qwenMatches[i][1].trim());
        if (
          typeof parsed === "object" &&
          parsed !== null &&
          "name" in parsed &&
          typeof (parsed as Record<string, unknown>).name === "string"
        ) {
          const tc = parsed as { name: string; arguments?: Record<string, unknown>; id?: string };
          calls.push({
            name: tc.name,
            arguments: typeof tc.arguments === "object" && tc.arguments !== null ? tc.arguments : {},
            id: tc.id ?? `local_${i}_${Date.now()}`,
          });
        }
      } catch {
        // ignore malformed entry
      }
    }
    if (calls.length > 0) return calls;
  }

  // Mistral v3 fallback: [TOOL_CALLS] [{"name": "...", "arguments": {...}, "id": "..."}]
  const mistralMatch = output.match(/\[TOOL_CALLS\]\s*(\[[\s\S]*?\])/);
  if (mistralMatch) {
    try {
      const parsed: unknown[] = JSON.parse(mistralMatch[1]);
      if (Array.isArray(parsed)) {
        return parsed
          .filter(
            (tc): tc is { name: string; arguments: Record<string, unknown>; id?: string } =>
              typeof tc === "object" &&
              tc !== null &&
              "name" in tc &&
              typeof (tc as Record<string, unknown>).name === "string",
          )
          .map((tc, i) => ({
            name: tc.name,
            arguments: typeof tc.arguments === "object" && tc.arguments !== null ? tc.arguments : {},
            id: tc.id ?? `local_${i}_${Date.now()}`,
          }));
      }
    } catch {
      // ignore
    }
  }

  return [];
}

async function generate(messages: EnhancedChatMessage[], tools?: MistralTool[]) {
  const { tokenizer, model } = await loadModel(currentModelId);

  const templateOptions: Record<string, unknown> = {
    add_generation_prompt: true,
    return_dict: true,
  };
  if (tools?.length) {
    templateOptions.tools = tools;
  }

  const inputs = tokenizer.apply_chat_template(messages, templateOptions);
  stoppingCriteria.reset();

  if (!tools?.length) {
    // Text-only mode: stream tokens live for smooth UX
    const streamer = new TextStreamer(tokenizer, {
      skip_prompt: true,
      skip_special_tokens: true,
      callback_function: (output: string) => {
        if (output) {
          post({ status: "update", output });
        }
      },
    });

    await model.generate({
      ...inputs,
      max_new_tokens: 2048,
      do_sample: true,
      top_k: 3,
      temperature: 0.2,
      streamer,
      stopping_criteria: stoppingCriteria,
      return_dict_in_generate: true,
    });

    post({ status: "complete" });
  } else {
    // Tool-calling mode: keep special tokens so we can detect [TOOL_CALLS]
    let fullOutput = "";

    const streamer = new TextStreamer(tokenizer, {
      skip_prompt: true,
      skip_special_tokens: false,
      callback_function: (output: string) => {
        if (output) fullOutput += output;
      },
    });

    await model.generate({
      ...inputs,
      max_new_tokens: 2048,
      do_sample: false,
      streamer,
      stopping_criteria: stoppingCriteria,
      return_dict_in_generate: true,
    });

    const toolCalls = parseToolCalls(fullOutput);

    if (toolCalls.length > 0) {
      post({ status: "tool_calls", toolCalls });
    } else {
      // Strip residual special tokens (Qwen, Llama, Mistral formats)
      const cleanOutput = fullOutput
        .replace(/<tool_call>[\s\S]*?<\/tool_call>/g, "")
        .replace(/\[\/INST\]|\[INST\]|<s>|<\/s>|\[TOOL_CALLS\]/g, "")
        .trim();

      if (cleanOutput) post({ status: "update", output: cleanOutput });
      post({ status: "complete" });
    }
  }
}

self.addEventListener("message", async (event: MessageEvent<WorkerRequest>) => {
  const { type } = event.data;

  try {
    switch (type) {
      case "check":
        post({ status: "check", supported: isWebGPUSupported() });
        break;

      case "load":
        await loadModel(event.data.data?.modelId ?? DEFAULT_MODEL_ID);
        break;

      case "generate":
        await generate(event.data.data.messages, event.data.data.tools);
        break;

      case "interrupt":
        stoppingCriteria.interrupt();
        break;

      case "reset":
        stoppingCriteria.reset();
        pipelineInstance = null;
        pipelinePromise = null;
        currentModelId = DEFAULT_MODEL_ID;
        break;
    }
  } catch (error) {
    post({ status: "error", error: toErrorMessage(error) });
  }
});
