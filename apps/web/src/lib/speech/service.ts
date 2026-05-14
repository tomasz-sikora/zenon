/**
 * Speech service — ASR and TTS bridging main thread to Speech Worker.
 * Exposes: transcribeAudio(), speak(), stopSpeech()
 */

let speechWorker: Worker | null = null;
let workerReady = false;
let reqCounter = 0;
const pending = new Map<string, { resolve: (v: string) => void; reject: (e: Error) => void }>();

function getSpeechWorker(): Worker {
  if (!speechWorker) {
    speechWorker = new Worker(new URL("../../workers/speech.worker.ts", import.meta.url), { type: "module" });
    speechWorker.onmessage = (e) => {
      const msg = e.data as { id: string; type: string; text?: string; error?: string };
      if (msg.type === "ready") { workerReady = true; return; }
      const req = pending.get(msg.id);
      if (!req) return;
      if (msg.type === "transcript") { req.resolve(msg.text ?? ""); pending.delete(msg.id); }
      else if (msg.type === "error") { req.reject(new Error(msg.error)); pending.delete(msg.id); }
    };
  }
  return speechWorker;
}

export async function transcribeAudio(audioBuffer: AudioBuffer): Promise<string> {
  const w = getSpeechWorker();
  const offlineCtx = new OfflineAudioContext(1, Math.ceil(audioBuffer.duration * 16000), 16000);
  const source = offlineCtx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(offlineCtx.destination);
  source.start();
  const resampled = await offlineCtx.startRendering();
  const audio = resampled.getChannelData(0);
  const audioCopy = new Float32Array(audio);

  while (!workerReady) await new Promise((r) => setTimeout(r, 200));
  const id = `speech-${++reqCounter}`;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ id, type: "transcribe", audio: audioCopy }, [audioCopy.buffer]);
  });
}

let currentUtterance: SpeechSynthesisUtterance | null = null;

export function speak(text: string, options?: { lang?: string; rate?: number; pitch?: number }): void {
  if (!window.speechSynthesis) return;
  stopSpeech();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = options?.lang ?? "en-US";
  utterance.rate = options?.rate ?? 1;
  utterance.pitch = options?.pitch ?? 1;
  currentUtterance = utterance;
  window.speechSynthesis.speak(utterance);
}

export function stopSpeech(): void {
  window.speechSynthesis?.cancel();
  currentUtterance = null;
}

export function isSpeaking(): boolean {
  return window.speechSynthesis?.speaking ?? false;
}
