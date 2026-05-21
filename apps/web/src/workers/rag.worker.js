/**
 * RAG Web Worker — handles embedding generation using transformers.js.
 * Runs all-MiniLM-L6-v2 model to create 384-dimensional sentence embeddings.
 */
import { pipeline } from "@xenova/transformers";
let embedder = null;
let loading = false;
let loadError = null;
function post(msg) {
    self.postMessage(msg);
}
async function getEmbedder() {
    if (embedder)
        return embedder;
    if (loading) {
        while (loading)
            await new Promise((r) => setTimeout(r, 100));
        if (loadError)
            throw new Error(loadError);
        return embedder;
    }
    loading = true;
    try {
        embedder = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", {
            progress_callback: (progress) => {
                post({
                    id: "__progress__",
                    type: "progress",
                    progress: progress.progress ?? 0,
                    message: `Loading model: ${progress.file ?? ""}`,
                });
            },
        });
        post({ id: "__init__", type: "ready" });
        return embedder;
    }
    catch (e) {
        loadError = String(e);
        throw e;
    }
    finally {
        loading = false;
    }
}
async function embed(text) {
    const pipe = await getEmbedder();
    const output = await pipe(text, { pooling: "mean", normalize: true });
    return Array.from(output.data);
}
// Start loading model immediately
getEmbedder().catch((e) => {
    post({ id: "__init__", type: "error", error: String(e) });
});
self.onmessage = async (event) => {
    const { id, type } = event.data;
    try {
        if (type === "embed") {
            const text = event.data.text;
            const embedding = await embed(text);
            post({ id, type: "embedding", embedding });
        }
        else if (type === "embed_batch") {
            const texts = event.data.texts;
            const embeddings = await Promise.all(texts.map(embed));
            post({ id, type: "embeddings", embeddings });
        }
    }
    catch (e) {
        post({ id, type: "error", error: e instanceof Error ? e.message : String(e) });
    }
};
