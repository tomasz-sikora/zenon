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

---

## 11. Python output files captured via FS snapshot

**Decision:** After each `python_exec` invocation, diff the Pyodide working directory against a snapshot taken before execution to detect new files, then transfer them to OPFS.

**Rationale:**
- Python code can write files through any mechanism (`open()`, pandas `to_csv()`, matplotlib `savefig()`, etc.). Intercepting every write call would require patching the Pyodide VFS; diffing the directory is simpler and catches all cases.
- Files are read as base64 inside the worker and sent via `postMessage` to the main thread, where they are written to the current workspace's OPFS `files/` directory.
- The approach adds negligible overhead for typical workloads (directory listing is fast; only new files are transferred).

---

## 12. tar.gz export using native CompressionStream

**Decision:** Implement workspace tar.gz export with a hand-written POSIX tar header builder and the browser-native `CompressionStream('gzip')` API rather than adding a bundled compression library.

**Rationale:**
- Adding `pako`, `fflate`, or similar would increase the bundle size by ~50–200 kB for functionality used infrequently.
- `CompressionStream` is available in all modern browsers (Chrome 80+, Firefox 113+, Safari 16.4+) and requires zero bytes of bundle space.
- A POSIX ustar tar format is straightforward to implement (~100 lines); the spec is stable and well-documented.
- The trade-off is that the export cannot be streamed directly to disk (it is buffered in memory), but workspace sizes are expected to remain well under the available tab heap.

---

## 13. vitest + jsdom for frontend unit/UI tests

**Decision:** Use vitest with jsdom and `@testing-library/react` for automated tests of storage utilities and workspace UI components.

**Rationale:**
- vitest shares the Vite config (transforms, path aliases) so TypeScript and `@/` imports work out of the box without a separate Jest Babel pipeline.
- jsdom allows rendering React components and simulating user interactions (click, type) without a real browser, making tests fast and runnable in CI.
- OPFS is not available in jsdom; a lightweight in-memory `Map`-backed shim implemented in `src/test/setup.ts` is sufficient to test the storage layer in isolation.
- `CompressionStream` is also shimmed in setup.ts as a pass-through to keep tar.gz tests simple.

---

## 14. OpenAI tool-result message format: one message per call

**Decision:** `messagesToOpenAI` now uses `flatMap` to expand a single internal `role:"tool"` message (which may contain N `tool_result` content items) into N separate OpenAI API tool messages.

**Rationale:**
- The runner's internal loop is clean: all results from a parallel tool execution round are packed into one internal `role:"tool"` message with multiple content items.
- OpenAI's API requires exactly one `role:"tool"` message **per** `tool_call_id`. Sending one combined message left N-1 results unmatched, causing a 400 `tool_call_ids did not have response messages` error on every multi-tool round.
- The previous code used `.find()` (first result only) instead of `.filter()` + `flatMap`, so the mismatch was silent until the second API round failed.
- `sanitizeMessages` in `runner.ts` was also rewritten to scan **all** consecutive `role:"tool"` messages following an assistant tool-call message (not just `msgs[i+1]`), ensuring orphaned history from aborted runs is fully removed before the next API call.

---

## 15. ChatGPT-style assistant reply after tool results

**Decision:** After the last `onToolResult` fires for a round, the next model output (text, thinking, or new tool call) is placed in a **new** assistant message rather than appended to the message that contained the tool-call bubbles.

**Rationale:**
- Without this, the summary text was appended inside the same bubble as the tool-call chips, making it visually ambiguous and easy to miss.
- Creating a fresh `role:"assistant"` message after tool results produces the familiar ChatGPT-style layout: tool-call bubble → tool-result rows → separate assistant reply below.
- Implemented via a `needNewAssistantMsg` flag in `startAssistantRun` (ChatPage.tsx). The flag is set on every `onToolResult` and cleared (creating the new message) on the first subsequent `onChunk`, `onToolCall`, or `onThinking` event.
- The `thinkingAccumulator` is reset when the new message is created so reasoning blocks attach to the correct message.

