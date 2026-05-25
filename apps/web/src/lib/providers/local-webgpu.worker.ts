import {
  AutoModelForImageTextToText,
  AutoProcessor,
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
  // Disable the browser's CacheStorage cache so model files are always fetched
  // from nginx. Without this, a stale cached copy (e.g. an incomplete file from
  // a previous deployment) persists indefinitely and causes "invalid data
  // location" errors during ORT inference even after the server files are fixed.
  env.useBrowserCache = false;
}

const MODEL_ID = "mistralai/Ministral-3-3B-Instruct-2512-ONNX";

type EnhancedChatMessage = {
  role: string;
  content: string;
  tool_call_id?: string;
  name?: string;
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
  | { type: "load" }
  | { type: "generate"; data: { messages: EnhancedChatMessage[] } }
  | { type: "interrupt" }
  | { type: "reset" };

type WorkerResponse =
  | { status: "check"; supported: boolean }
  | { status: "loading"; data?: string }
  | { status: "progress"; file?: string; name?: string; loaded?: number; total?: number; progress?: number }
  | { status: "ready"; modelId: string }
  | { status: "update"; output: string }
  | { status: "complete" }
  | { status: "error"; error: string };

function post(message: WorkerResponse) {
  self.postMessage(message);
}

function isWebGPUSupported(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function progressCallback(info: ProgressMessage) {
  post({
    status: "progress",
    file: info.file,
    name: info.name,
    loaded: info.loaded,
    total: info.total,
    progress: info.progress,
  });
}

class MinistralEngine {
  private processor: Awaited<ReturnType<typeof AutoProcessor.from_pretrained>> | null = null;
  private model: Awaited<ReturnType<typeof AutoModelForImageTextToText.from_pretrained>> | null = null;
  private stoppingCriteria = new InterruptableStoppingCriteria();
  public isLoaded = false;
  public isLoading = false;

  async load() {
    if (this.isLoaded) return;
    if (this.isLoading) return;
    this.isLoading = true;

    // Resolve from pre-fetched static assets when available, otherwise fall back
    // to the HuggingFace Hub (dev / non-Docker environments).
    const resolvedId = LOCAL_MODEL_BASE ? `${LOCAL_MODEL_BASE}/${MODEL_ID}` : MODEL_ID;

    try {
      post({ status: "loading", data: `Loading ${MODEL_ID}…` });

      this.processor = await AutoProcessor.from_pretrained(resolvedId, {
        progress_callback: progressCallback,
      });

      // dtype: embed_tokens fp16 (~805 MB) + vision_encoder q4 (~271 MB) + decoder q4f16 (~2 GB).
      // The vision_encoder is required by Mistral3ForConditionalGeneration even for text-only
      // inference — omitting it causes a model-load failure in transformers.js. Total ~3.1 GB.
      this.model = await AutoModelForImageTextToText.from_pretrained(resolvedId, {
        dtype: {
          embed_tokens: "fp16",
          vision_encoder: "q4",
          decoder_model_merged: "q4f16",
        },
        device: "webgpu",
        progress_callback: progressCallback,
      } as Parameters<typeof AutoModelForImageTextToText.from_pretrained>[1]);

      post({ status: "loading", data: "Warming up model…" });
      this.stoppingCriteria.reset();
      const warmupInputs = this.processor.tokenizer!.apply_chat_template(
        [{ role: "user", content: "Hi" }],
        { add_generation_prompt: true, return_dict: true },
      ) as Record<string, unknown>;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (this.model.generate as any)({
        ...warmupInputs,
        max_new_tokens: 1,
        do_sample: false,
        stopping_criteria: this.stoppingCriteria,
      });

      this.isLoaded = true;
      post({ status: "ready", modelId: MODEL_ID });
    } catch (err) {
      this.isLoaded = false;
      this.processor = null;
      this.model = null;
      throw err;
    } finally {
      this.isLoading = false;
    }
  }

  async generate(messages: EnhancedChatMessage[]) {
    if (!this.model || !this.processor) {
      throw new Error("Model not loaded");
    }

    const inputs = this.processor.tokenizer!.apply_chat_template(messages, {
      add_generation_prompt: true,
      return_dict: true,
    }) as Record<string, unknown>;

    this.stoppingCriteria.reset();

    const streamer = new TextStreamer(this.processor.tokenizer!, {
      skip_prompt: true,
      skip_special_tokens: true,
      callback_function: (output: string) => {
        if (output) {
          post({ status: "update", output });
        }
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (this.model.generate as any)({
      ...inputs,
      max_new_tokens: 2048,
      do_sample: true,
      top_k: 3,
      temperature: 0.2,
      streamer,
      stopping_criteria: this.stoppingCriteria,
    });

    post({ status: "complete" });
  }

  interrupt() {
    this.stoppingCriteria.interrupt();
  }

  reset() {
    this.stoppingCriteria.reset();
    this.isLoaded = false;
    this.isLoading = false;
    this.processor = null;
    this.model = null;
  }
}

const engine = new MinistralEngine();

self.addEventListener("message", async (event: MessageEvent<WorkerRequest>) => {
  const { type } = event.data;

  try {
    switch (type) {
      case "check":
        post({ status: "check", supported: isWebGPUSupported() });
        break;

      case "load":
        await engine.load();
        break;

      case "generate":
        if (!engine.isLoaded) {
          await engine.load();
        }
        await engine.generate(event.data.data.messages);
        break;

      case "interrupt":
        engine.interrupt();
        break;

      case "reset":
        engine.reset();
        break;
    }
  } catch (error) {
    post({ status: "error", error: toErrorMessage(error) });
  }
});
