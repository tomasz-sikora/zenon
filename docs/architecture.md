# Architecture

## Overview

Zenon is a **browser-first, privacy-preserving AI chat application**. The vast majority of application logic runs entirely inside the user's browser. A minimal proxy server handles only one concern: forwarding API calls to AI providers so that browser CORS restrictions do not block them.

```
┌─────────────────────────────────────────────────────────┐
│                      Browser                            │
│                                                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │  React SPA (apps/web)                            │  │
│  │                                                  │  │
│  │  ┌──────────┐  ┌────────┐  ┌───────────────┐   │  │
│  │  │  Chat UI  │  │ Agents │  │  Workspaces   │   │  │
│  │  └──────────┘  └────────┘  └───────────────┘   │  │
│  │                                                  │  │
│  │  ┌──────────────┐  ┌──────────┐  ┌──────────┐  │  │
│  │  │ Zustand store│  │  OPFS    │  │ WebWorker│  │  │
│  │  │ (localStorage│  │  files   │  │ pool     │  │  │
│  │  │  / memory)   │  │          │  │          │  │  │
│  │  └──────────────┘  └──────────┘  └──────────┘  │  │
│  └──────────────────────────────────────────────────┘  │
│                          │                              │
│          HTTPS /api/*    │                              │
└──────────────────────────┼──────────────────────────────┘
                           │
              ┌────────────▼────────────┐
              │  Hono Proxy (apps/proxy) │
              │  port 3001               │
              └────────────┬────────────┘
                           │  HTTPS
          ┌────────────────┼────────────────────┐
          ▼                ▼                    ▼
   api.openai.com  api.anthropic.com  bedrock / gemini / …
```

---

## Monorepo Layout

The project uses **pnpm workspaces** and **Turborepo** for task orchestration.

```
Zenon/
├── apps/
│   ├── web/                  # React + Vite SPA
│   │   └── src/
│   │       ├── app/          # App shell, routing, theme
│   │       ├── features/     # Page-level feature modules
│   │       │   ├── chat/     # Chat UI components
│   │       │   ├── agents/   # Agent management UI
│   │       │   ├── rag/      # RAG document management UI
│   │       │   ├── workspace/# Workspace file browser
│   │       │   └── settings/ # Settings page
│   │       ├── store/        # Zustand stores (persisted state)
│   │       ├── lib/          # Core logic (providers, tools, RAG, MCP…)
│   │       │   ├── providers/ # Per-provider API adapters
│   │       │   ├── tools/    # Tool definitions & executors
│   │       │   ├── rag/      # Embedding + vector search
│   │       │   ├── mcp/      # MCP client
│   │       │   ├── storage/  # OPFS helpers
│   │       │   ├── agent/    # Agent runner (tool-call loop)
│   │       │   └── speech/   # TTS / ASR helpers
│   │       ├── components/   # Shared UI primitives
│   │       └── workers/      # Web Workers (Pyodide, RAG, Speech)
│   └── proxy/                # Hono/Node CORS proxy
│       └── src/
│           ├── routes/
│           │   ├── chat.ts      # /api/chat/completions  (OpenAI-compat)
│           │   ├── anthropic.ts # /api/anthropic/messages
│           │   └── bedrock.ts   # /api/bedrock/*
│           └── index.ts
└── packages/
    └── shared-types/         # TypeScript types shared by web & proxy
```

---

## Data Flow: Chat Message

```
User types message
       │
       ▼
ChatInput.tsx
       │
       ▼
conversationStore  ←── message persisted to Zustand (localStorage)
       │
       ▼
lib/agent/runner.ts  ←── resolves provider + model, applies agent instructions
       │
       ├── tool-use loop?  ──► lib/tools/registry.ts ──► executor()
       │                            │
       │                      (python_exec → tools.worker.ts / Pyodide)
       │                      (rag_search  → rag.worker.ts / transformers.js)
       │                      (fetch_webpage, file ops, charts …)
       │
       ▼
lib/providers/<provider>.ts   ←── wraps streaming API call
       │
       ▼
POST /api/chat/completions  (or /api/anthropic/messages, /api/bedrock/…)
       │  (via proxy for CORS; local/WebGPU providers skip proxy)
       ▼
AI Provider API
       │
       ▼  SSE stream
MessageBubble streaming render  ──► conversationStore update
```

---

## State Management

All state is managed with **Zustand** and persisted to `localStorage` via the `persist` middleware.

| Store | Persistence | Description |
|---|---|---|
| `conversationStore` | localStorage | All conversations and message history |
| `providerStore` | localStorage | Provider configs; API keys stored in raw `localStorage` separately (not in Zustand persist blob) |
| `agentStore` | localStorage | Agent definitions |
| `workspaceStore` | localStorage | Workspace metadata; file contents in OPFS |
| `mcpStore` | localStorage | MCP server configurations |
| `skillStore` | localStorage | Custom skill/CLAUDE.md files |
| `localModelStore` | localStorage | Local model download state |
| `ragStore` | localStorage | RAG config: embedding model, chunking params, CSV handling mode |

**API keys** are stored under `zenon-key-<providerId>` in `localStorage`. They never leave the browser except as `Authorization` headers forwarded by the proxy.

---

## File Storage (OPFS)

Large binary data (uploaded documents, agent knowledge files, workspace files, artifacts) are stored in the browser's **Origin Private File System (OPFS)**. Directory layout:

```
workspaces/
  <workspaceId>/
    files/       ← user-uploaded files + Python output files
    artifacts/   ← tool output files
    history/     ← (reserved)
    vectors/     ← RAG vector index (index.json)
```

OPFS is accessed synchronously in dedicated workers where possible, and asynchronously from the main thread via the helpers in `lib/storage/opfs.ts`.

Key helpers exported from `opfs.ts`:

| Helper | Description |
|---|---|
| `writeFile` / `readFile` / `deleteFile` | Low-level file I/O |
| `listDir` / `listDirRecursive` | Directory listing with MIME detection |
| `getDirStats(path)` | Returns `{ fileCount, totalSize }` for a directory tree |
| `createTarGz(dirPath)` | Streams all files under a path into a POSIX tar archive compressed with `CompressionStream('gzip')` |

### Python → workspace file flow

When the `python_exec` tool finishes, `tools.worker.ts` snapshots the Pyodide working directory before and after execution. Any new files are read as base64 and included in the `WorkerResponse.outputFiles` map. `pyodideTools.ts` receives this map on the main thread and writes each file into the current workspace's `files/` directory via `writeFile()`.

---

## Web Workers

Heavy or blocking operations run in Web Workers to keep the UI responsive:

| Worker | Runtime | Handles |
|---|---|---|
| `tools.worker.ts` | Pyodide (WASM Python 3.12) | `python_exec` tool — sandboxed Python, matplotlib, captures output files |
| `rag.worker.ts` | `@huggingface/transformers` v4 | Embedding generation for RAG indexing & search (configurable model, default 384-d `all-MiniLM-L6-v2`). Supports model pre-download and runtime switching. |
| `speech.worker.ts` | `@xenova/transformers` (Whisper) | ASR transcription |
| `local-webgpu.worker.ts` | `@huggingface/transformers` (WebGPU) | On-device LLM inference |

> **Browser security requirements** — `rag.worker.ts` (ONNX WASM) and `tools.worker.ts` (Pyodide) both rely on `SharedArrayBuffer`, which the browser only enables in a **cross-origin isolated** context. Both the Vite dev server and the production nginx config serve two required headers:
> ```
> Cross-Origin-Opener-Policy: same-origin
> Cross-Origin-Embedder-Policy: require-corp
> ```

---

## Provider Adapters

Each provider has a TypeScript adapter in `lib/providers/` that implements a common `BaseProvider` interface:

- `openai.ts` — OpenAI and all OpenAI-compatible APIs (Ollama, etc.)
- `anthropic.ts` — Anthropic Messages API (streaming SSE)
- `gemini.ts` — Google Generative Language API
- `local-webgpu.ts` — On-device inference via Transformers.js WebGPU pipeline

AWS Bedrock is handled server-side by the proxy (`routes/bedrock.ts`) because it requires AWS SigV4 request signing.

---

## Proxy Service

The proxy (`apps/proxy`) is a thin **Hono** application. Its only responsibilities are:

1. **CORS bypass** — the browser cannot directly call `api.anthropic.com` because of CORS headers; the proxy relays the request server-side.
2. **AWS Bedrock signing** — SigV4 signatures require the AWS SDK, which is too large for a browser bundle.
3. **Ollama bridge** — nginx proxies `/ollama/` to `host.docker.internal:11434` so that the HTTPS SPA can reach the HTTP Ollama daemon on the host.

The proxy does **not** log, store, or inspect request bodies.

---

## Docker Deployment

```
nginx (port 80 / 443)
  │
  ├── /*          ─────────────► static SPA files (built into image)
  ├── /models/*   ─────────────► pre-fetched ONNX model files (404 if missing)
  ├── /api/*      ─────────────► proxy:3001
  ├── /health     ─────────────► proxy:3001/health
  └── /ollama/*   ─────────────► host.docker.internal:11434
```

The Docker build has **three stages**:

1. **`model-downloader`** (Python): Uses `huggingface_hub` to pre-fetch the
   q4f16 ONNX weights + JSON configs for each configured local WebGPU model
   (Llama 3.2 1B, SmolLM2 1.7B, Qwen 2.5 1.5B). Files land in `/models/`.
2. **`builder`** (Node.js): Runs `pnpm install` and `vite build` with
   `VITE_LOCAL_MODEL_BASE_URL=/models` baked in, so the WebGPU worker loads
   models from the pre-fetched static assets instead of downloading from
   HuggingFace at runtime.
3. **`runtime`** (nginx): Serves the SPA and pre-fetched model files. The
   `/models/` location returns **404** for missing files (not the SPA fallback)
   so that transformers.js receives a proper HTTP error instead of HTML.

The `/models/` nginx location deliberately does **not** fall back to
`index.html`; this ensures that a misconfigured or missing model produces a
clear 404 rather than a confusing JSON parse error inside the WebGPU worker.

> **Model / Dockerfile consistency rule** — the model repos listed in
> `Dockerfile.web` must exactly match `SUPPORTED_LOCAL_MODELS` in
> `localModelStore.ts` and the `local-webgpu` provider entries in
> `providerStore.ts`. All three sources reference:
> - `onnx-community/Llama-3.2-1B-Instruct-q4f16`
> - `HuggingFaceTB/SmolLM2-1.7B-Instruct`
> - `onnx-community/Qwen2.5-1.5B-Instruct`

TLS is provided by a self-signed certificate generated at image build time. For production use, replace the nginx cert/key with your own certificate (e.g. from Let's Encrypt).

The `web` service depends on `proxy` via a Docker health-check so nginx only starts accepting traffic once the proxy is ready.
