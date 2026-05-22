import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AgentDefinition } from "@zenon/shared-types";
import { generateId } from "@/lib/utils";

interface AgentStore {
  agents: AgentDefinition[];
  createAgent: (agent: Omit<AgentDefinition, "id" | "createdAt" | "updatedAt">) => string;
  updateAgent: (id: string, patch: Partial<AgentDefinition>) => void;
  deleteAgent: (id: string) => void;
  getAgent: (id: string) => AgentDefinition | undefined;
  duplicateAgent: (id: string) => string | undefined;
}

export const DEFAULT_AGENT_TOOLS = [
  "python_exec",
  "read_file",
  "write_file",
  "list_files",
  "append_file",
  "delete_file",
];

function withDefaultAgentTools(extraTools: string[]): string[] {
  return Array.from(new Set([...DEFAULT_AGENT_TOOLS, ...extraTools]));
}

export const BUILTIN_AGENTS: AgentDefinition[] = [
  {
    id: "general",
    name: "General Assistant",
    description: "General-purpose assistant with Python and workspace file operations",
    avatar: "🤖",
    instructions:
      "You are a helpful, harmless, and honest AI assistant. Use Python and workspace file tools whenever analysis, drafts, or local artifacts would improve the answer.",
    model: { providerId: "openai", modelId: "gpt-4o" },
    tools: withDefaultAgentTools(["fetch_webpage", "datetime"]),
    knowledgeFiles: [],
    ragEnabled: false,
    isBuiltIn: true,
    createdAt: 0,
    updatedAt: 0,
    tags: ["general"],
    skillFiles: [
      {
        name: "working-style.md",
        content: "- Start with a concise plan.\n- Use workspace files for longer outputs.\n- Prefer verifiable steps and cite tool outputs when used.",
      },
    ],
  },
  {
    id: "coder",
    name: "Python Coder",
    description: "Writes, executes, and iterates on Python code with workspace artifacts",
    avatar: "🐍",
    instructions:
      "You are an expert Python developer. Solve tasks with runnable code, execute it to verify results, and save useful scripts, outputs, and notes to workspace files.",
    model: { providerId: "openai", modelId: "gpt-4o" },
    tools: withDefaultAgentTools(["pip_install"]),
    knowledgeFiles: [],
    ragEnabled: false,
    isBuiltIn: true,
    createdAt: 0,
    updatedAt: 0,
    tags: ["code", "python"],
    skillFiles: [
      {
        name: "python-quality-checklist.md",
        content: "- Reproduce the problem first.\n- Keep solutions small and testable.\n- Save final script and sample output into workspace files.",
      },
    ],
  },
  {
    id: "researcher",
    name: "Web Researcher",
    description: "Researches topics from the web and compiles notes in workspace files",
    avatar: "🔍",
    instructions:
      "You are a research assistant. Read relevant web sources, synthesize accurate findings, and save research notes or source summaries to workspace files when helpful.",
    model: { providerId: "openai", modelId: "gpt-4o" },
    tools: withDefaultAgentTools(["fetch_webpage", "datetime"]),
    knowledgeFiles: [],
    ragEnabled: false,
    isBuiltIn: true,
    createdAt: 0,
    updatedAt: 0,
    tags: ["research", "web"],
    skillFiles: [
      {
        name: "research-template.md",
        content: "## Research template\n- Question\n- Key findings\n- Evidence\n- Open risks\n- Suggested next steps",
      },
    ],
  },
  {
    id: "doc-analyst",
    name: "Document Analyst",
    description: "Analyses knowledge files with RAG and can draft outputs in workspace",
    avatar: "📄",
    instructions:
      "You are a document analysis assistant. Use rag_search before answering, cite source documents, and optionally save structured summaries to workspace files.",
    model: { providerId: "openai", modelId: "gpt-4o" },
    tools: withDefaultAgentTools(["rag_search", "read_pdf", "read_word"]),
    knowledgeFiles: [],
    ragEnabled: true,
    isBuiltIn: true,
    createdAt: 0,
    updatedAt: 0,
    tags: ["rag", "documents"],
    skillFiles: [
      {
        name: "document-extraction.md",
        content: "- Quote key passages verbatim.\n- Distinguish facts from interpretation.\n- Provide section-wise summary with citations.",
      },
    ],
  },
  {
    id: "data-analyst",
    name: "Data Analyst",
    description: "Analyses CSV/Excel data with Python and creates charts or reports",
    avatar: "📊",
    instructions:
      "You are a data analyst. Read workspace datasets, run Python-based analysis, and produce charts or report files with clear conclusions.",
    model: { providerId: "openai", modelId: "gpt-4o" },
    tools: withDefaultAgentTools(["read_csv", "read_excel", "write_excel", "create_chart", "create_diagram", "pip_install"]),
    knowledgeFiles: [],
    ragEnabled: false,
    isBuiltIn: true,
    createdAt: 0,
    updatedAt: 0,
    tags: ["data", "python", "charts"],
    skillFiles: [
      {
        name: "analysis-report.md",
        content: "## Analysis report\n1. Data quality checks\n2. Findings\n3. Visuals produced\n4. Recommendations",
      },
    ],
  },
  {
    id: "office-assistant",
    name: "Office Assistant",
    description: "Works with PDF/Word/Excel files and produces polished workspace outputs",
    avatar: "🗂️",
    instructions:
      "You are an office productivity assistant. Read and transform office files, then save clean deliverables back to the workspace.",
    model: { providerId: "openai", modelId: "gpt-4o" },
    tools: withDefaultAgentTools(["read_pdf", "read_word", "read_excel", "write_excel", "read_csv", "create_pdf"]),
    knowledgeFiles: [],
    ragEnabled: false,
    isBuiltIn: true,
    createdAt: 0,
    updatedAt: 0,
    tags: ["office", "documents", "productivity"],
    skillFiles: [
      {
        name: "deliverable-template.md",
        content: "- Clarify requested output format.\n- Keep a change log section.\n- Save final deliverable to workspace with explicit filename.",
      },
    ],
  },
  {
    id: "workflow-designer",
    name: "Workflow Designer",
    description: "Designs process docs and diagrams, then saves implementation-ready assets",
    avatar: "🛠️",
    instructions:
      "You design technical and operational workflows. Create structured plans, diagrams, and implementation notes as reusable workspace files.",
    model: { providerId: "openai", modelId: "gpt-4o" },
    tools: withDefaultAgentTools(["create_diagram", "create_chart", "datetime"]),
    knowledgeFiles: [],
    ragEnabled: false,
    isBuiltIn: true,
    createdAt: 0,
    updatedAt: 0,
    tags: ["workflow", "diagram", "planning"],
    skillFiles: [
      {
        name: "workflow-blueprint.md",
        content: "## Workflow blueprint\n- Actors\n- Steps\n- Decision points\n- Failure modes\n- Monitoring signals",
      },
    ],
  },
];

export const useAgentStore = create<AgentStore>()(
  persist(
    (set, get) => ({
      agents: BUILTIN_AGENTS,

      createAgent: (agent) => {
        const id = generateId();
        const now = Date.now();
        set((s) => ({
          agents: [
            ...s.agents,
            { ...agent, id, createdAt: now, updatedAt: now },
          ],
        }));
        return id;
      },

      updateAgent: (id, patch) => {
        set((s) => ({
          agents: s.agents.map((a) =>
            a.id === id ? { ...a, ...patch, updatedAt: Date.now() } : a,
          ),
        }));
      },

      deleteAgent: (id) => {
        const agent = get().agents.find((a) => a.id === id);
        if (agent?.isBuiltIn) return;
        set((s) => ({ agents: s.agents.filter((a) => a.id !== id) }));
      },

      getAgent: (id) => get().agents.find((a) => a.id === id),

      duplicateAgent: (id) => {
        const source = get().agents.find((a) => a.id === id);
        if (!source) return undefined;
        const newId = generateId();
        const now = Date.now();
        set((s) => ({
          agents: [
            ...s.agents,
            {
              ...source,
              id: newId,
              name: `${source.name} (copy)`,
              isBuiltIn: false,
              createdAt: now,
              updatedAt: now,
            },
          ],
        }));
        return newId;
      },
    }),
    { name: "zenon-agents" },
  ),
);
