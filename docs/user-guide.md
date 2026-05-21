# User Guide

## Getting Started

When you open Zenon for the first time you will land on the **Chat** page. Before you can send a message you need to configure at least one AI provider with a valid API key.

---

## 1. Configuring Providers

Go to **Settings → Providers**.

Built-in providers:

| Provider | Notes |
|---|---|
| **OpenAI** | Requires an OpenAI API key. Models: GPT-4o, GPT-4.1, o3, o4-mini |
| **Anthropic** | Requires an Anthropic API key. Models: Claude Opus/Sonnet/Haiku 4.5 |
| **Google Gemini** | Requires a Google AI Studio API key. Models: Gemini 2.5 Pro/Flash |
| **AWS Bedrock** | Requires AWS access key + secret + region. Proxied via the backend. |
| **Ollama (local)** | No key needed. Ollama must be running on the host at port 11434. |
| **Local (WebGPU)** | No key needed. Model is downloaded once and cached in the browser. |

You can also add a **custom OpenAI-compatible** provider by supplying a base URL and optional API key.

API keys are stored **only in your browser's `localStorage`** and are never persisted anywhere else.

---

## 2. Chatting

1. Select a provider and model from the model selector in the top bar.
2. Type your message in the input field and press **Enter** (or click Send).
3. Use **Shift+Enter** to insert a line break without sending.
4. Attach images or files by clicking the paperclip icon (vision-capable models only for images).

### Conversation branches

You can regenerate any assistant reply to get an alternative response. The original reply is preserved as a branch you can navigate back to using the branch arrows that appear on the message.

### Pinning and tagging

Right-click (or use the ⋯ menu) on a conversation in the sidebar to pin it or add tags.

---

## 3. Agents

Go to **Agents** in the sidebar to manage agents.

An **agent** combines:
- A system prompt (instructions)
- A specific model
- A set of enabled tools
- Optional RAG knowledge files
- Optional skill files (markdown documents prepended to the system prompt)

### Built-in agents

All built-in agents include **Python execution** plus **workspace file operation tools** (`read_file`, `write_file`, `list_files`, `append_file`, `delete_file`) by default.

| Agent | Description |
|---|---|
| General Assistant | General helper with web/date/math tools plus Python + workspace file ops |
| Python Coder | Code-focused Python agent with execution and package install support |
| Web Researcher | Researches web sources and can compile notes in workspace files |
| Document Analyst | Uses RAG + document readers to answer with citations |
| Data Analyst | Processes CSV/Excel, runs Python, creates charts/diagrams |
| Office Assistant | Works with PDF/Word/Excel and generates polished deliverables |
| Workflow Designer | Creates process plans, diagrams, and implementation assets |

Built-ins also include **example skill files** you can inspect and adapt when creating custom agents.

### Creating a custom agent

1. Click **New Agent**.
2. Fill in name, description, avatar emoji, and system instructions.
3. Select the model and enable the tools you want.
4. Optionally upload knowledge files and enable **RAG**.
5. Click **Save**.

To start a conversation with an agent, open a new chat and select the agent from the agent picker.

---

## 4. Tools

Tools are called automatically by the model when it decides they are useful. You can also instruct the model explicitly: *"use the python_exec tool to …"*.

### Available tools

| Tool | Description |
|---|---|
| `fetch_webpage` | Fetches a URL and returns clean readable text |
| `datetime` | Returns the current date and time |
| `python_exec` | Executes Python 3 in Pyodide (WASM). Supports numpy, pandas, matplotlib, and most pure-Python packages via `micropip`. |
| `read_file` | Reads a file from the current workspace |
| `write_file` | Writes / creates a file in the current workspace |
| `read_csv` | Parses a CSV file into structured data |
| `read_excel` | Parses an Excel file (.xlsx) |
| `read_word` | Extracts text from a Word document (.docx) |
| `create_chart` | Creates a Chart.js chart and saves it as an image |
| `rag_search` | Searches the agent's indexed knowledge files |

### Python execution notes

- Runs entirely in-browser via **Pyodide** (Python 3.12 WASM). No code leaves your machine.
- `matplotlib` figures are automatically captured and displayed inline.
- Call `micropip.install(["package"])` inside your code to install additional packages at runtime.
- Execution is sandboxed — no network access from Python.
- **Any files written by Python code are automatically saved to the current workspace** (e.g. CSVs, plots, model outputs). They appear in the Workspace file browser immediately.

---

## 5. Workspaces

A workspace is an isolated container for conversations and files. Use workspaces to separate different projects.

- File storage uses the browser's **Origin Private File System (OPFS)** — files persist across sessions but are never synced to any server.
- Files in one workspace are not visible in another.

### Managing workspaces

Click the workspace name at the top of the **Workspace** file browser (or the **⚙ Manage** button) to open the workspace manager. From there you can:

| Action | How |
|---|---|
| **Create** | Click **+ New Workspace**, enter a name |
| **Switch** | Click any workspace in the list |
| **Rename** | Click the pencil icon next to the name |
| **Download** | Click the download icon to export the whole workspace as a `.tar.gz` archive |
| **Delete** | Click the trash icon (cannot delete the active workspace) |

The header bar also shows a live **file count** and **total size** for the current workspace.

### Uploading files

In the file browser, click **Upload** to add files. Supported types include PDFs, images, CSV, Excel, Word documents, and plain text.

### File preview

Click any file to preview it inline:

| File type | Preview |
|---|---|
| Plain text, Markdown, JSON, YAML, Python, JS, … | Syntax-highlighted code block |
| CSV | Rendered table (first 50 rows) |
| Images (PNG, JPG, GIF, WebP, SVG, …) | Inline image |
| PDF | Embedded PDF viewer |
| Binary / unknown | Download button only |

To download an individual file, use the **Download** icon in the file row or in the preview panel.

### Python → workspace integration

When the `python_exec` tool creates files (e.g. `plt.savefig("chart.png")` or any `open("file.txt", "w")` write), they are **automatically saved to the current workspace**. You can find them in the file browser immediately after the code cell finishes executing.

---

## 6. RAG (Retrieval-Augmented Generation)

Go to **RAG** in the sidebar to manage indexed documents.

1. Upload one or more documents.
2. Click **Index** to embed the document (runs locally in a Web Worker using Transformers.js).
3. Assign the indexed files to an agent's **Knowledge Files** list.
4. Enable **RAG** on the agent.

When a conversation uses that agent, the `rag_search` tool will be available and the model can retrieve relevant passages from the indexed documents.

> **Note:** First-time indexing downloads the embedding model (~80 MB) and caches it in the browser.

---

## 7. MCP Servers

Go to **Settings → MCP Servers** to connect external [Model Context Protocol](https://modelcontextprotocol.io) servers.

1. Click **Add Server**.
2. Provide a name, URL, and transport type (HTTP or SSE).
3. Optionally add authentication headers.
4. Enable the server.

Tools discovered from connected MCP servers become available in the agent tool selector.

---

## 8. Local Models (WebGPU)

Select **Local (WebGPU)** as the provider and choose a model (e.g. Gemma 4 2B or Qwen 2.5 3B).

- The model weights are downloaded once from Hugging Face and cached in IndexedDB.
- Inference runs fully on-device using your GPU via the WebGPU API.
- No API key required.
- Requires a browser with WebGPU support (Chrome 113+ / Edge 113+ recommended).

---

## 9. Speech

- **Text-to-speech (TTS):** Enable in **Settings → Speech**. Uses the Web Speech API. Voice can be selected from the voices provided by your OS.
- **Automatic speech recognition (ASR):** Click the microphone icon in the chat input. Uses the Web Speech API or Whisper WASM (if configured).

---

## 10. Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Enter` | Send message |
| `Shift+Enter` | New line in message |
| `Cmd/Ctrl+K` | Focus model selector / command palette |
| `Esc` | Cancel current generation |

---

## Data & Privacy

- **All conversations, files, and settings are stored locally in your browser.** Nothing is sent to any Zenon server.
- API requests travel directly from your browser to the AI provider (via the proxy only for CORS bypass — the proxy does not log bodies).
- Clearing your browser's site data will permanently delete all conversations and files.
- There is no account system and no sync.
