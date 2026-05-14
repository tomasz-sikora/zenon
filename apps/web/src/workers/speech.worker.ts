/**
 * Speech Worker — ASR (Whisper via transformers.js) and TTS (Web Speech API).
 * Runs in a Web Worker to avoid blocking the main thread.
 */

import { pipeline, type AutomaticSpeechRecognitionPipeline } from "@xenova/transformers";

let asrPipeline: AutomaticSpeechRecognitionPipeline | null = null;
let asrLoading = false;

interface WorkerMessage {
  id: string;
  type: "transcribe" | "init_asr";
  audio?: Float32Array;
  language?: string;
}

interface WorkerResponse {
  id: string;
  type: "transcript" | "ready" | "error" | "progress";
  text?: string;
  error?: string;
  progress?: number;
  message?: string;
}

function post(msg: WorkerResponse) {
  self.postMessage(msg);
}

async function getASR(): Promise<AutomaticSpeechRecognitionPipeline> {
  if (asrPipeline) return asrPipeline;
  if (asrLoading) {
    while (asrLoading) await new Promise((r) => setTimeout(r, 100));
    return asrPipeline!;
  }
  asrLoading = true;
  asrPipeline = await pipeline("automatic-speech-recognition", "Xenova/whisper-base.en", {
    progress_callback: (p: { progress?: number; file?: string }) => {
      post({ id: "__progress__", type: "progress", progress: p.progress ?? 0, message: `Loading ASR: ${p.file ?? ""}` });
    },
  });
  asrLoading = false;
  post({ id: "__asr_ready__", type: "ready" });
  return asrPipeline!;
}

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const { id, type } = event.data;
  try {
    if (type === "init_asr") {
      await getASR();
      return;
    }
    if (type === "transcribe") {
      const audio = event.data.audio!;
      const pipe = await getASR();
      const result = await pipe(audio, { language: event.data.language ?? "english", task: "transcribe" });
      const text = Array.isArray(result) ? result.map((r) => r.text).join(" ") : result.text;
      post({ id, type: "transcript", text });
    }
  } catch (e) {
    post({ id, type: "error", error: e instanceof Error ? e.message : String(e) });
  }
};
