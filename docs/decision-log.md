# Decision Log

Significant technical and architectural decisions made during the development of Zenon, with rationale.

---

## 1. Browser-first, no backend persistence

**Decision:** Store all user data (conversations, files, settings, API keys) exclusively in the browser (`localStorage`, OPFS, IndexedDB).

**Rationale:**
- Privacy by design — the user's data never leaves their device.
- Eliminates the need for user accounts, a database, and GDPR-related data handling.
- Significantly reduces operational complexity (no database to run, backup, or migrate).
- The main trade-off is no cross-device sync; this was accepted as a deliberate constraint for the initial version.

---

## 2. Thin proxy instead of a full backend

**Decision:** The `apps/proxy` service exists only to forward requests to AI provider APIs.

**Rationale:**
- Modern browsers block cross-origin requests to `api.openai.com`, `api.anthropic.com`, etc.
- A full backend (with session management, streaming orchestration, etc.) would re-introduce server-side data handling and the associated privacy concerns.
- The proxy is intentionally stateless and does not log or inspect request/response bodies.
- AWS Bedrock is the one exception — SigV4 request signing cannot reasonably be done in the browser without exposing AWS credentials in JS bundles, so signing stays on the server.

---

## 3. Turborepo + pnpm workspaces

**Decision:** Use a monorepo managed by pnpm workspaces with Turborepo for task orchestration.

**Rationale:**
- `packages/shared-types` is consumed by both `apps/web` and `apps/proxy`. A monorepo makes this trivial.
- Turborepo's caching speeds up CI builds and local rebuilds significantly.
- pnpm's strict dependency isolation prevents phantom dependencies — important when bundling code that runs in radically different environments (browser WASM vs. Node).

---

## 4. Zustand for state management

**Decision:** Use Zustand (with `persist` middleware) rather than Redux, Jotai, or React Context.

**Rationale:**
- Zustand is minimal and does not require wrapping the component tree in providers.
- The `persist` middleware makes localStorage serialisation a one-liner.
- The API is straightforward enough that each store (agents, providers, workspaces, conversations…) can be a standalone file without boilerplate.
- Redux was considered but rejected due to its verbosity for a project of this scale.

---

## 5. Web Workers for heavy computation

**Decision:** Run Pyodide, embedding models, Whisper, and local LLM inference in dedicated Web Workers.

**Rationale:**
- These operations can take seconds to minutes and would block the main thread, making the UI unresponsive.
- Web Workers run in a separate thread with their own memory space, which also helps with WASM's memory requirements.
- The worker message protocol (`WorkerRequest` / `WorkerResponse` types in `shared-types`) provides a clean async boundary.

---

## 6. OPFS for file storage

**Decision:** Use the Origin Private File System API for workspace files instead of `localStorage` or IndexedDB blobs.

**Rationale:**
- `localStorage` has a 5–10 MB per-origin quota — far too small for PDFs or datasets.
- IndexedDB blob storage works but has no directory/path abstraction and is cumbersome for hierarchical workspaces.
- OPFS provides a real file-system-like API with large quotas (quota is shared with the origin, typically gigabytes).
- OPFS can be accessed synchronously from a `FileSystemSyncAccessHandle` inside a dedicated worker, which is important for Pyodide's virtual filesystem bridge.

---

## 7. Hono for the proxy

**Decision:** Use Hono as the HTTP framework for the proxy server.

**Rationale:**
- Hono is lightweight, TypeScript-first, and runs on both Bun (dev) and Node 22 (production Docker image without Bun).
- Its streaming helpers (`hono/streaming`) make SSE pass-through trivial.
- The framework is well-documented and has zero runtime dependencies beyond the core package.
- Express was considered but is heavier and not TypeScript-native.

---

## 8. Self-signed TLS in Docker

**Decision:** Generate a self-signed certificate at image build time rather than shipping HTTP or requiring the user to provide a certificate.

**Rationale:**
- Several browser APIs required by Zenon — SharedArrayBuffer (for Pyodide), `navigator.mediaDevices` (for ASR), and the Web Speech API — are gated behind a **secure context** (`https://` or `localhost`). Running over plain HTTP on a LAN IP would disable these features.
- Generating the cert at build time avoids the need for the user to run `openssl` commands manually.
- The trade-off (browser security warning) is documented in the README and user guide.
- For production use, the operator is expected to replace the cert with one signed by a trusted CA.

---

## 9. Ollama bridged via nginx

**Decision:** Proxy `/ollama/*` → `host.docker.internal:11434` in nginx rather than routing through the Hono proxy.

**Rationale:**
- Ollama runs over HTTP. When the SPA is served over HTTPS, browsers block mixed-content requests.
- Routing through nginx keeps the Ollama traffic on the same HTTPS origin as the app, satisfying the browser's mixed-content policy.
- This is a one-line nginx `location` block; adding extra hops through the Node proxy would add latency for large model responses.

---

## 10. RAG with in-browser embeddings

**Decision:** Compute embeddings in the browser using a small model via Transformers.js rather than calling an external embedding API.

**Rationale:**
- Sending documents to an external embedding API contradicts the privacy-first goal.
- `all-MiniLM-L6-v2` (~80 MB) produces good-quality embeddings for retrieval tasks and fits comfortably in browser memory.
- Running embeddings in a Web Worker keeps the main thread responsive during indexing.
- The trade-off is the one-time ~80 MB model download; subsequent runs use the cached model from IndexedDB.
