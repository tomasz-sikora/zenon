import { useState, useRef, useEffect } from "react";
import {
  Bot,
  Plus,
  Pencil,
  Trash2,
  Copy,
  Download,
  Upload,
  X,
  Check,
  ChevronDown,
  Search,
  FileText,
} from "lucide-react";
import { useAgentStore, DEFAULT_AGENT_TOOLS } from "@/store/agentStore";
import { useProviderStore } from "@/store/providerStore";
import { useWorkspaceStore } from "@/store/workspaceStore";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { useConversationStore } from "@/store/conversationStore";
import { toolRegistry } from "@/lib/tools/registry";
import type { AgentDefinition, AgentSkillFile } from "@zenon/shared-types";
import { toast } from "@/components/ui/Toaster";

// ─── EMOJI PICKER (simple inline) ───────────────────────────────────────────
const EMOJI_LIST = [
  "🤖","🧠","💡","🔍","📊","📄","🐍","🎨","🔬","📐","🗂️",
  "⚡","🛠️","📝","🌐","🔗","🧩","📡","🚀","🔐","📈","🎯",
];

// ─── AGENT BUILDER MODAL ─────────────────────────────────────────────────────
interface AgentBuilderProps {
  initial?: AgentDefinition;
  onClose: () => void;
  onSave: (data: Omit<AgentDefinition, "id" | "createdAt" | "updatedAt">) => void;
}

function AgentBuilder({ initial, onClose, onSave }: AgentBuilderProps) {
  const allProviders = useProviderStore((s) => s.providers);
  const providers = allProviders.filter((p) => p.enabled !== false);
  const availableTools = toolRegistry.getAll().map((t) => t.definition);
  const workspaces = useWorkspaceStore((s) => s.workspaces);

  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [avatar, setAvatar] = useState(initial?.avatar ?? "🤖");
  const [instructions, setInstructions] = useState(initial?.instructions ?? "");
  const [providerId, setProviderId] = useState(initial?.model.providerId ?? providers[0]?.id ?? "openai");
  const [modelId, setModelId] = useState(initial?.model.modelId ?? "gpt-4o");
  const [selectedTools, setSelectedTools] = useState<string[]>(initial?.tools ?? DEFAULT_AGENT_TOOLS);
  const [ragEnabled, setRagEnabled] = useState(initial?.ragEnabled ?? false);
  const [tags, setTags] = useState((initial?.tags ?? []).join(", "));
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [toolSearch, setToolSearch] = useState("");
  const [skillFiles, setSkillFiles] = useState<AgentSkillFile[]>(initial?.skillFiles ?? []);
  const [editingSkillIdx, setEditingSkillIdx] = useState<number | null>(null);

  const selectedProvider = providers.find((p) => p.id === providerId);
  const providerModels = selectedProvider?.models ?? [];
  const filteredTools = availableTools.filter(
    (t) => toolSearch === "" || t.name.includes(toolSearch) || t.description?.toLowerCase().includes(toolSearch.toLowerCase())
  );

  function toggleTool(name: string) {
    setSelectedTools((prev) =>
      prev.includes(name) ? prev.filter((t) => t !== name) : [...prev, name]
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      description: description.trim(),
      avatar,
      instructions,
      model: { providerId, modelId },
      tools: selectedTools,
      knowledgeFiles: initial?.knowledgeFiles ?? [],
      ragEnabled,
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      skillFiles,
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="relative bg-background border border-border rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-semibold text-lg">{initial ? "Edit Agent" : "New Agent"}</h2>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-muted text-muted-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <form id="agent-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {/* Avatar + Name */}
          <div className="flex gap-3 items-start">
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowEmojiPicker((v) => !v)}
                className="h-14 w-14 text-3xl rounded-xl border-2 border-border hover:border-primary flex items-center justify-center bg-muted transition-colors"
              >
                {avatar}
              </button>
              {showEmojiPicker && (
                <div className="absolute top-16 left-0 z-10 bg-popover border border-border rounded-lg p-2 shadow-lg grid grid-cols-6 gap-1">
                  {EMOJI_LIST.map((e) => (
                    <button
                      key={e}
                      type="button"
                      className="text-xl hover:bg-muted rounded p-1 w-8 h-8 flex items-center justify-center"
                      onClick={() => { setAvatar(e); setShowEmojiPicker(false); }}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex-1 space-y-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Agent name"
                required
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Short description"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          {/* Instructions */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">System Instructions</label>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={5}
              placeholder="You are a helpful assistant that..."
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none font-mono"
            />
          </div>

          {/* Model */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Model</label>
            <div className="flex gap-2">
              <select
                value={providerId}
                onChange={(e) => { setProviderId(e.target.value); setModelId(""); }}
                className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              {providerModels.length > 0 ? (
                <select
                  value={modelId}
                  onChange={(e) => setModelId(e.target.value)}
                  className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {providerModels.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              ) : (
                <input
                  value={modelId}
                  onChange={(e) => setModelId(e.target.value)}
                  placeholder="Model ID (e.g. gpt-4o)"
                  className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              )}
            </div>
          </div>

          {/* Tools */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Tools ({selectedTools.length} selected)</label>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                <input
                  value={toolSearch}
                  onChange={(e) => setToolSearch(e.target.value)}
                  placeholder="Filter tools..."
                  className="pl-6 pr-2 py-1 text-xs rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>
            <div className="border border-border rounded-lg overflow-hidden max-h-48 overflow-y-auto">
              {filteredTools.map((tool) => (
                <label
                  key={tool.name}
                  className={cn(
                    "flex items-start gap-3 px-3 py-2 cursor-pointer hover:bg-muted/50 border-b border-border last:border-0 transition-colors",
                    selectedTools.includes(tool.name) && "bg-primary/5"
                  )}
                >
                  <div className={cn(
                    "mt-0.5 h-4 w-4 shrink-0 rounded border flex items-center justify-center",
                    selectedTools.includes(tool.name) ? "bg-primary border-primary text-primary-foreground" : "border-border"
                  )}>
                    {selectedTools.includes(tool.name) && <Check className="h-3 w-3" />}
                  </div>
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={selectedTools.includes(tool.name)}
                    onChange={() => toggleTool(tool.name)}
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-mono text-xs font-medium">{tool.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{tool.description}</div>
                  </div>
                </label>
              ))}
              {filteredTools.length === 0 && (
                <div className="py-4 text-center text-sm text-muted-foreground">No tools match</div>
              )}
            </div>
          </div>

          {/* Skills (pre-loaded markdown context, like CLAUDE.md) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium flex items-center gap-1.5">
                <FileText className="h-4 w-4" />
                Skill Files
                <span className="text-xs font-normal text-muted-foreground ml-1">
                  (markdown context pre-loaded into this agent, like CLAUDE.md)
                </span>
              </label>
              <button
                type="button"
                onClick={() => {
                  setSkillFiles((prev) => [...prev, { name: "New Skill", content: "" }]);
                  setEditingSkillIdx(skillFiles.length);
                }}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded border border-dashed border-border hover:bg-muted transition-colors"
              >
                <Plus className="h-3 w-3" /> Add skill file
              </button>
            </div>
            {skillFiles.length === 0 && (
              <p className="text-xs text-muted-foreground py-2">
                No skill files. Add markdown documents (e.g. project conventions, style guides) to pre-load as context.
              </p>
            )}
            <div className="space-y-2">
              {skillFiles.map((sf, idx) => (
                <div key={idx} className="rounded-lg border border-border overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2 bg-muted/40 border-b border-border">
                    <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    {editingSkillIdx === idx ? (
                      <input
                        autoFocus
                        value={sf.name}
                        onChange={(e) =>
                          setSkillFiles((prev) =>
                            prev.map((s, i) => (i === idx ? { ...s, name: e.target.value } : s))
                          )
                        }
                        className="flex-1 text-sm bg-transparent border-none outline-none"
                        placeholder="Skill file name (e.g. CONVENTIONS.md)"
                      />
                    ) : (
                      <span className="flex-1 text-sm font-medium">{sf.name || "Untitled"}</span>
                    )}
                    <button
                      type="button"
                      onClick={() => setEditingSkillIdx(editingSkillIdx === idx ? null : idx)}
                      className="p-0.5 hover:text-foreground text-muted-foreground transition-colors"
                      title={editingSkillIdx === idx ? "Collapse" : "Edit"}
                    >
                      <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", editingSkillIdx === idx && "rotate-180")} />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSkillFiles((prev) => prev.filter((_, i) => i !== idx));
                        if (editingSkillIdx === idx) setEditingSkillIdx(null);
                      }}
                      className="p-0.5 hover:text-destructive text-muted-foreground transition-colors"
                      title="Remove skill file"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {editingSkillIdx === idx && (
                    <textarea
                      value={sf.content}
                      onChange={(e) =>
                        setSkillFiles((prev) =>
                          prev.map((s, i) => (i === idx ? { ...s, content: e.target.value } : s))
                        )
                      }
                      rows={8}
                      placeholder="Enter markdown content for this skill file..."
                      className="w-full px-3 py-2 text-sm font-mono bg-background focus:outline-none resize-y"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* RAG + Tags */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">RAG / Knowledge Base</label>
              <label className="flex items-center gap-2 cursor-pointer">
                <div
                  onClick={() => setRagEnabled((v) => !v)}
                  className={cn(
                    "h-5 w-9 rounded-full transition-colors relative",
                    ragEnabled ? "bg-primary" : "bg-muted"
                  )}
                >
                  <div className={cn(
                    "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform",
                    ragEnabled ? "translate-x-4" : "translate-x-0.5"
                  )} />
                </div>
                <span className="text-sm text-muted-foreground">Enable RAG search</span>
              </label>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Tags (comma-separated)</label>
              <input
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="code, python, analysis"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="agent-form"
            onClick={handleSubmit as unknown as React.MouseEventHandler<HTMLButtonElement>}
            className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            {initial ? "Save Changes" : "Create Agent"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function AgentsPage() {
  const { agents, createAgent, updateAgent, deleteAgent, duplicateAgent } = useAgentStore();
  const navigate = useNavigate();
  const createConversation = useConversationStore((s) => s.createConversation);
  const { currentWorkspaceId } = useWorkspaceStore();
  const importRef = useRef<HTMLInputElement>(null);

  const [showBuilder, setShowBuilder] = useState(false);
  const [editTarget, setEditTarget] = useState<AgentDefinition | undefined>();
  const [search, setSearch] = useState("");
  const [filterTag, setFilterTag] = useState<string | null>(null);

  const allTags = Array.from(new Set(agents.flatMap((a) => a.tags ?? [])));

  const filtered = agents.filter((a) => {
    const matchesSearch =
      search === "" ||
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.description.toLowerCase().includes(search.toLowerCase());
    const matchesTag = filterTag === null || (a.tags ?? []).includes(filterTag);
    return matchesSearch && matchesTag;
  });

  function handleUseAgent(agentId: string) {
    const convId = createConversation({
      workspaceId: currentWorkspaceId ?? "default",
      agentId,
    });
    void navigate(`/chat/${convId}`);
  }

  function handleEdit(agent: AgentDefinition) {
    setEditTarget(agent);
    setShowBuilder(true);
  }

  function handleSave(data: Omit<AgentDefinition, "id" | "createdAt" | "updatedAt">) {
    if (editTarget) {
      updateAgent(editTarget.id, data);
      toast.success("Agent updated");
    } else {
      createAgent(data);
      toast.success("Agent created");
    }
    setEditTarget(undefined);
  }

  function handleDelete(agent: AgentDefinition) {
    if (agent.isBuiltIn) return;
    if (!confirm(`Delete agent "${agent.name}"?`)) return;
    deleteAgent(agent.id);
    toast.success("Agent deleted");
  }

  function handleDuplicate(agent: AgentDefinition) {
    duplicateAgent(agent.id);
    toast.success(`Duplicated "${agent.name}"`);
  }

  function handleExport(agent: AgentDefinition) {
    const blob = new Blob([JSON.stringify(agent, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${agent.name.toLowerCase().replace(/\s+/g, "-")}.agent.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string) as AgentDefinition;
        createAgent({
          name: data.name,
          description: data.description,
          avatar: data.avatar ?? "🤖",
          instructions: data.instructions ?? "",
          model: data.model,
          tools: data.tools ?? [],
          knowledgeFiles: data.knowledgeFiles ?? [],
          ragEnabled: data.ragEnabled ?? false,
          tags: data.tags ?? [],
          skillFiles: data.skillFiles ?? [],
        });
        toast.success("Agent imported");
      } catch {
        toast.error("Invalid agent file");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b border-border px-6 py-4 shrink-0">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold">Agents</h1>
            <p className="text-sm text-muted-foreground">
              Pre-configured AI assistants with specific tools and instructions
            </p>
          </div>
          <div className="flex gap-2">
            <input ref={importRef} type="file" accept=".json" className="sr-only" onChange={handleImport} />
            <button
              onClick={() => importRef.current?.click()}
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted transition-colors"
            >
              <Upload className="h-4 w-4" />
              Import
            </button>
            <button
              onClick={() => { setEditTarget(undefined); setShowBuilder(true); }}
              className="flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-4 w-4" />
              New Agent
            </button>
          </div>
        </div>

        {/* Search + tag filter */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search agents..."
              className="w-full pl-8 pr-3 py-1.5 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="flex flex-wrap gap-1">
            <button
              onClick={() => setFilterTag(null)}
              className={cn(
                "px-2.5 py-1 rounded-full text-xs font-medium transition-colors",
                filterTag === null ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}
            >
              All
            </button>
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => setFilterTag(filterTag === tag ? null : tag)}
                className={cn(
                  "px-2.5 py-1 rounded-full text-xs font-medium transition-colors",
                  filterTag === tag ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
            <Bot className="h-12 w-12 opacity-20" />
            <p className="text-sm">No agents match your search</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((agent) => (
              <div
                key={agent.id}
                className="group rounded-xl border border-border bg-card p-4 flex flex-col gap-3 hover:border-primary/30 transition-colors"
              >
                {/* Agent header */}
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-muted text-2xl shrink-0">
                    {agent.avatar}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium truncate text-sm">{agent.name}</h3>
                      {agent.isBuiltIn && (
                        <span className="shrink-0 text-[10px] bg-muted text-muted-foreground rounded px-1.5 py-0.5">
                          built-in
                        </span>
                      )}
                      {agent.ragEnabled && (
                        <span className="shrink-0 text-[10px] bg-blue-500/10 text-blue-500 rounded px-1.5 py-0.5">
                          RAG
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                      {agent.description}
                    </p>
                  </div>
                </div>

                {/* Tools */}
                {agent.tools.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {agent.tools.slice(0, 4).map((tool) => (
                      <span
                        key={tool}
                        className="text-[10px] bg-muted rounded px-1.5 py-0.5 font-mono text-muted-foreground"
                      >
                        {tool}
                      </span>
                    ))}
                    {agent.tools.length > 4 && (
                      <span className="text-[10px] text-muted-foreground">
                        +{agent.tools.length - 4} more
                      </span>
                    )}
                  </div>
                )}

                {/* Tags */}
                {agent.tags && agent.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {agent.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-[10px] bg-primary/10 text-primary rounded-full px-2 py-0.5"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Actions */}
                <div className="mt-auto flex gap-2">
                  <button
                    onClick={() => handleUseAgent(agent.id)}
                    className="flex-1 rounded-md bg-primary/10 text-primary hover:bg-primary/20 px-3 py-1.5 text-sm font-medium transition-colors"
                  >
                    Start Chat
                  </button>
                  <div className="flex gap-1">
                    {!agent.isBuiltIn && (
                      <button
                        onClick={() => handleEdit(agent)}
                        title="Edit"
                        className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => handleDuplicate(agent)}
                      title="Duplicate"
                      className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleExport(agent)}
                      title="Export JSON"
                      className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </button>
                    {!agent.isBuiltIn && (
                      <button
                        onClick={() => handleDelete(agent)}
                        title="Delete"
                        className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Builder modal */}
      {showBuilder && (
        <AgentBuilder
          initial={editTarget}
          onClose={() => { setShowBuilder(false); setEditTarget(undefined); }}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
