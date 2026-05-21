/**
 * Speech Worker — ASR (Whisper via transformers.js) and TTS (Web Speech API).
 * Runs in a Web Worker to avoid blocking the main thread.
 */
import { pipeline } from "@xenova/transformers";
let asrPipeline = null;
let asrLoading = false;
function post(msg) {
    self.postMessage(msg);
}
async function getASR() {
    if (asrPipeline)
        return asrPipeline;
    if (asrLoading) {
        while (asrLoading)
            await new Promise((r) => setTimeout(r, 100));
        return asrPipeline;
    }
    asrLoading = true;
    asrPipeline = await pipeline("automatic-speech-recognition", "Xenova/whisper-base.en", {
        progress_callback: (p) => {
            post({ id: "__progress__", type: "progress", progress: p.progress ?? 0, message: `Loading ASR: ${p.file ?? ""}` });
        },
    });
    asrLoading = false;
    post({ id: "__asr_ready__", type: "ready" });
    return asrPipeline;
}
self.onmessage = async (event) => {
    const { id, type } = event.data;
    try {
        if (type === "init_asr") {
            await getASR();
            return;
        }
        if (type === "transcribe") {
            const audio = event.data.audio;
            const pipe = await getASR();
            const result = await pipe(audio, { language: event.data.language ?? "english", task: "transcribe" });
            const text = Array.isArray(result) ? result.map((r) => r.text).join(" ") : result.text;
            post({ id, type: "transcript", text });
        }
    }
    catch (e) {
        post({ id, type: "error", error: e instanceof Error ? e.message : String(e) });
    }
};
