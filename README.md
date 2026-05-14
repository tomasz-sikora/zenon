# Zenon

A privacy-first, browser-based AI chat application. All conversations and files live entirely in your browser — no account required, no data sent to any server except the AI provider you choose.

![Zenon UI](docs/assets/screenshot.png)

## Features

- **Multi-provider support** — OpenAI, Anthropic (Claude), Google Gemini, AWS Bedrock, Ollama, and local WebGPU models
- **Custom agents** — define agents with specific models, instructions, tools, and RAG knowledge bases
- **Tool use** — built-in tools: Python execution (Pyodide/WASM), web fetch, file read/write, CSV/Excel/Word parsing, chart generation, RAG search, speech
- **RAG (Retrieval-Augmented Generation)** — index documents and let agents search them at inference time
- **Workspaces** — isolate conversations and files per project; stored in OPFS (browser file system)
- **MCP integration** — connect external MCP servers over HTTP/SSE to extend the tool catalogue
- **Speech** — text-to-speech and automatic speech recognition via Web Speech API / Whisper WASM
- **Local inference** — run small models directly in the browser via WebGPU (Transformers.js) or WebAssembly (Ailoy)
- **Docker deployment** — single `docker compose up` spins up the SPA + a lightweight API proxy with HTTPS

## Quick Start

### Development

Prerequisites: **Node 22+**, **pnpm 9+**, **Bun** (for the proxy dev server)

```bash
# Install dependencies
pnpm install

# Start all apps in watch mode
pnpm dev
```

- Web app → http://localhost:5173
- Proxy → http://localhost:3001

### Production (Docker)

```bash
docker compose up --build -d
```

The stack exposes:
- `https://<host>/` — the web app (self-signed cert, accept the browser warning)
- `http://<host>:3001` — the proxy (not required to expose publicly)

> **Ollama users:** run Ollama on the Docker host and it will be automatically reachable at `/ollama/` via the nginx bridge.

## Repository Structure

```
Zenon/
├── apps/
│   ├── web/           # React + Vite SPA
│   └── proxy/         # Hono/Node API proxy (CORS bridge)
├── packages/
│   └── shared-types/  # TypeScript types shared across apps
├── docker-compose.yml
├── Dockerfile.proxy
├── Dockerfile.web
└── nginx.conf
```

## Documentation

| Document | Description |
|---|---|
| [Architecture](docs/architecture.md) | System design, data flows, component map |
| [User Guide](docs/user-guide.md) | How to use Zenon — providers, agents, workspaces, tools |
| [Limitations](docs/limitations.md) | Known constraints and trade-offs |
| [Decision Log](docs/decision-log.md) | Why certain technical choices were made |

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS, shadcn/ui (Radix) |
| State | Zustand (persisted to localStorage / OPFS) |
| Build system | Turborepo + pnpm workspaces |
| Proxy | Hono, Bun / Node 22 |
| Containerisation | Docker, nginx |
| Local AI | Transformers.js (WebGPU), Pyodide (WASM Python), Ailoy |

## License

MIT
