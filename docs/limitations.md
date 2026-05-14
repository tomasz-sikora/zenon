# Limitations

## Browser & Runtime Constraints

### Memory
- All conversation history, agent definitions, and workspace metadata are held in `localStorage`. Chrome's typical quota is 5–10 MB per origin. Very long conversations with many messages (especially those containing large tool results or base64-encoded images) can hit this limit.
- OPFS (for workspace files) has a much larger quota (typically gigabytes) but individual file reads must fit in RAM at the time of processing.

### WebGPU Local Models
- Requires a WebGPU-capable browser (Chrome 113+ / Edge 113+). Firefox and Safari have experimental or no support.
- Model weights are large (1–4 GB). Initial download can be slow; subsequent loads read from IndexedDB cache.
- Inference speed depends heavily on GPU. Integrated GPUs (iGPU) are significantly slower than discrete GPUs.
- Only a small set of quantised models are pre-configured. Adding other models requires code changes.
- Function calling support for local models is limited and may produce unreliable results.

### Pyodide (Python)
- Cold start takes 3–10 seconds the first time Pyodide is loaded in a session.
- Only packages available via `micropip` (pure-Python wheels) can be installed at runtime. C-extension packages (e.g. `scipy` with Fortran BLAS) must be pre-bundled in the Pyodide distribution.
- No real filesystem access — Python code can only read/write through the OPFS bridge.
- No network access from within Python code (WASM sandbox).
- Maximum memory for Python is bounded by the browser tab's heap.

### RAG Embedding
- Uses `Xenova/all-MiniLM-L6-v2` or a similar small model (~80 MB). First-time use triggers a model download.
- Vector search is brute-force cosine similarity over all chunks. Performance degrades noticeably with >10,000 chunks.
- No persistent vector index between sessions — the index is rebuilt from OPFS-stored chunks on demand.

---

## AI Provider Limitations

### API Keys in Browser
- API keys are stored in `localStorage` (plain text). Anyone with access to the device and browser profile can read them. This is acceptable for personal / trusted-device use, but is not appropriate for shared machines.
- Zenon does not support OAuth flows or secrets management systems.

### AWS Bedrock
- Requires AWS credentials (access key + secret + region) to be entered in the UI. These follow the same security note as above.
- Only streaming invocations via `InvokeModelWithResponseStream` are supported. Batch inference is not.
- Only models pre-configured in `providerStore.ts` are available. Adding new Bedrock models requires a code change.

### Streaming
- All providers are expected to support SSE streaming. Non-streaming responses are supported as a fallback but the UX is degraded (no token-by-token display).
- Very long responses (>100 k tokens) may cause the browser tab to become unresponsive during rendering due to synchronous Markdown parsing.

---

## Deployment Limitations

### Self-Signed TLS
- The Docker image generates a self-signed certificate at build time. Browsers will show a security warning. Users must manually accept the certificate.
- PWA service worker registration is disabled when the certificate is not trusted (see `nginx.conf`) — this means offline mode is not available with the default setup.
- For production use, replace the self-signed cert with a CA-signed one and re-enable the service worker.

### Single-Node
- There is no clustering or high-availability configuration. The proxy is stateless and can technically be replicated, but the docker-compose setup is designed for a single machine.

### No Authentication
- There is no login system. Anyone who can reach the app's URL can use it (and would need to supply their own API keys). Adding authentication (e.g., nginx Basic Auth or an OAuth proxy) is left to the operator.

---

## Feature Gaps

- **No conversation sync / cloud backup.** All data is local. Losing the browser profile means losing all data.
- **No import/export of full conversation history** (individual export may be available per conversation via copy).
- **No multi-user support.** All data is in a single browser profile.
- **MCP tool execution latency.** MCP calls go through an extra network hop to the external MCP server; latency is not guaranteed.
- **No streaming for Bedrock** through the proxy — currently the proxy buffers and forwards; true SSE forwarding may need adjustment per model.
- **Image generation** is not supported.
- **File size limits.** Uploading very large files (>50 MB) via the workspace UI may cause the browser to run out of memory during parsing.
