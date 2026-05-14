import {
  AutoModelForCausalLM,
  AutoTokenizer,
  InterruptableStoppingCriteria,
  TextStreamer,
} from "@huggingface/transformers";

// Gemma 4 E2B (Efficient 2B) — Gemma4ForCausalLM is fully supported in transformers.js v4.
// transformers.js_config in the model's config.json auto-handles use_external_data_format.
const DEFAULT_MODEL_ID = "onnx-community/gemma-4-E2B-it-ONNX";

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

  pipelinePromise = (async () => {
    const tokenizer = await AutoTokenizer.from_pretrained(modelId, {
      progress_callback: progressCallback,
    });

    const model = await AutoModelForCausalLM.from_pretrained(modelId, {
      dtype: "q4f16",
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

/**
 * Converts Gemma 4's custom arg serialization to JSON.
 * Gemma 4 format: {key:<|"|>strval<|"|>,key2:42,key3:true,key4:{nested:val}}
 * Strings are delimited by <|"|>…<|"|>, keys have no quotes.
 */
function gemma4ArgsToJson(argsBlock: string): Record<string, unknown> {
  // Replace string sentinel <|"|>text<|"|> with JSON strings first to avoid key-quoting collisions
  const withJsonStrings = argsBlock.replace(/<\|"\|>([\s\S]*?)<\|"\|>/g, (_m, s: string) =>
    JSON.stringify(s),
  );
  // Quote bare keys (word chars before colon that are not already inside a quoted string)
  // We walk char-by-char to avoid quoting colons inside string values
  let result = "";
  let inString = false;
  let escape = false;
  for (let i = 0; i < withJsonStrings.length; i++) {
    const ch = withJsonStrings[i];
    if (escape) {
      result += ch;
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      result += ch;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      result += ch;
      continue;
    }
    if (!inString && ch === ":") {
      // Backtrack to find the start of the key and wrap it
      const keyMatch = result.match(/(\w+)$/);
      if (keyMatch) {
        result = result.slice(0, -keyMatch[1].length) + JSON.stringify(keyMatch[1]);
      }
    }
    result += ch;
  }
  try {
    return JSON.parse("{" + result + "}") as Record<string, unknown>;
  } catch {
    return {};
  }
}

function parseToolCalls(output: string): ParsedToolCall[] {
  // Gemma 4 format: <|tool_call>call:function_name{key:<|"|>val<|"|>,key2:42}
  const gemma4Matches = [...output.matchAll(/<\|tool_call>call:(\w+)\{([\s\S]*?)\}/g)];
  if (gemma4Matches.length > 0) {
    return gemma4Matches.map((m, i) => ({
      name: m[1],
      arguments: gemma4ArgsToJson(m[2]),
      id: `local_${i}_${Date.now()}`,
    }));
  }

  // Qwen2.5 format: <tool_call>{"name": "...", "arguments": {...}}</tool_call>
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
      // Strip residual special tokens (Gemma 4, Qwen, Mistral formats)
      const cleanOutput = fullOutput
        .replace(/<\|tool_call>[\s\S]*?\}/g, "")
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
