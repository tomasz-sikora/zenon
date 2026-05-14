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

const BUILTIN_AGENTS: AgentDefinition[] = [
  {
    id: "general",
    name: "General Assistant",
    description: "A helpful general-purpose AI assistant",
    avatar: "🤖",
    instructions: "You are a helpful, harmless, and honest AI assistant.",
    model: { providerId: "openai", modelId: "gpt-4o" },
    tools: ["fetch_webpage", "datetime"],
    knowledgeFiles: [],
    ragEnabled: false,
    isBuiltIn: true,
    createdAt: 0,
    updatedAt: 0,
    tags: ["general"],
  },
  {
    id: "coder",
    name: "Python Coder",
    description: "Writes and executes Python code to solve problems",
    avatar: "🐍",
    instructions:
      "You are an expert Python developer. When asked to solve problems, write Python code and execute it to verify the solution. Always show the code and its output.",
    model: { providerId: "openai", modelId: "gpt-4o" },
    tools: ["python_exec", "write_file", "read_file"],
    knowledgeFiles: [],
    ragEnabled: false,
    isBuiltIn: true,
    createdAt: 0,
    updatedAt: 0,
    tags: ["code", "python"],
  },
  {
    id: "researcher",
    name: "Web Researcher",
    description: "Researches topics by reading web pages",
    avatar: "🔍",
    instructions:
      "You are a research assistant. When asked about a topic, use the fetch_webpage tool to read relevant pages and synthesize accurate, well-sourced information.",
    model: { providerId: "openai", modelId: "gpt-4o" },
    tools: ["fetch_webpage"],
    knowledgeFiles: [],
    ragEnabled: false,
    isBuiltIn: true,
    createdAt: 0,
    updatedAt: 0,
    tags: ["research", "web"],
  },
  {
    id: "doc-analyst",
    name: "Document Analyst",
    description: "Analyses documents using RAG to answer questions",
    avatar: "📄",
    instructions:
      "You are a document analysis assistant. Use the rag_search tool to find relevant information in the knowledge base before answering questions. Always cite the source document.",
    model: { providerId: "openai", modelId: "gpt-4o" },
    tools: ["rag_search", "read_file"],
    knowledgeFiles: [],
    ragEnabled: true,
    isBuiltIn: true,
    createdAt: 0,
    updatedAt: 0,
    tags: ["rag", "documents"],
  },
  {
    id: "data-analyst",
    name: "Data Analyst",
    description: "Analyses CSV/Excel data and creates charts",
    avatar: "📊",
    instructions:
      "You are a data analyst. Use Python (Pyodide) to process data files. Read Excel/CSV files from the workspace, perform analysis, and create charts or summaries.",
    model: { providerId: "openai", modelId: "gpt-4o" },
    tools: ["python_exec", "read_file", "write_file", "read_csv", "read_excel", "create_chart"],
    knowledgeFiles: [],
    ragEnabled: false,
    isBuiltIn: true,
    createdAt: 0,
    updatedAt: 0,
    tags: ["data", "python", "charts"],
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
