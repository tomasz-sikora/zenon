import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useRef } from "react";
import { Bot, Plus, Pencil, Trash2, Copy, Download, Upload, X, Check, ChevronDown, Search, FileText, } from "lucide-react";
import { useAgentStore } from "@/store/agentStore";
import { useProviderStore } from "@/store/providerStore";
import { useWorkspaceStore } from "@/store/workspaceStore";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { useConversationStore } from "@/store/conversationStore";
import { toolRegistry } from "@/lib/tools/registry";
import { toast } from "@/components/ui/Toaster";
// ─── EMOJI PICKER (simple inline) ───────────────────────────────────────────
const EMOJI_LIST = [
    "🤖", "🧠", "💡", "🔍", "📊", "📄", "🐍", "🎨", "🔬", "📐", "🗂️",
    "⚡", "🛠️", "📝", "🌐", "🔗", "🧩", "📡", "🚀", "🔐", "📈", "🎯",
];
function AgentBuilder({ initial, onClose, onSave }) {
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
    const [selectedTools, setSelectedTools] = useState(initial?.tools ?? []);
    const [ragEnabled, setRagEnabled] = useState(initial?.ragEnabled ?? false);
    const [tags, setTags] = useState((initial?.tags ?? []).join(", "));
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [toolSearch, setToolSearch] = useState("");
    const [skillFiles, setSkillFiles] = useState(initial?.skillFiles ?? []);
    const [editingSkillIdx, setEditingSkillIdx] = useState(null);
    const selectedProvider = providers.find((p) => p.id === providerId);
    const providerModels = selectedProvider?.models ?? [];
    const filteredTools = availableTools.filter((t) => toolSearch === "" || t.name.includes(toolSearch) || t.description?.toLowerCase().includes(toolSearch.toLowerCase()));
    function toggleTool(name) {
        setSelectedTools((prev) => prev.includes(name) ? prev.filter((t) => t !== name) : [...prev, name]);
    }
    function handleSubmit(e) {
        e.preventDefault();
        if (!name.trim())
            return;
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
    return (_jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-black/50", onClick: (e) => e.target === e.currentTarget && onClose(), children: _jsxs("div", { className: "relative bg-background border border-border rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col", children: [_jsxs("div", { className: "flex items-center justify-between px-6 py-4 border-b border-border", children: [_jsx("h2", { className: "font-semibold text-lg", children: initial ? "Edit Agent" : "New Agent" }), _jsx("button", { onClick: onClose, className: "rounded-md p-1 hover:bg-muted text-muted-foreground", children: _jsx(X, { className: "h-5 w-5" }) })] }), _jsxs("form", { id: "agent-form", onSubmit: handleSubmit, className: "flex-1 overflow-y-auto px-6 py-4 space-y-5", children: [_jsxs("div", { className: "flex gap-3 items-start", children: [_jsxs("div", { className: "relative", children: [_jsx("button", { type: "button", onClick: () => setShowEmojiPicker((v) => !v), className: "h-14 w-14 text-3xl rounded-xl border-2 border-border hover:border-primary flex items-center justify-center bg-muted transition-colors", children: avatar }), showEmojiPicker && (_jsx("div", { className: "absolute top-16 left-0 z-10 bg-popover border border-border rounded-lg p-2 shadow-lg grid grid-cols-6 gap-1", children: EMOJI_LIST.map((e) => (_jsx("button", { type: "button", className: "text-xl hover:bg-muted rounded p-1 w-8 h-8 flex items-center justify-center", onClick: () => { setAvatar(e); setShowEmojiPicker(false); }, children: e }, e))) }))] }), _jsxs("div", { className: "flex-1 space-y-2", children: [_jsx("input", { value: name, onChange: (e) => setName(e.target.value), placeholder: "Agent name", required: true, className: "w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" }), _jsx("input", { value: description, onChange: (e) => setDescription(e.target.value), placeholder: "Short description", className: "w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" })] })] }), _jsxs("div", { className: "space-y-1.5", children: [_jsx("label", { className: "text-sm font-medium", children: "System Instructions" }), _jsx("textarea", { value: instructions, onChange: (e) => setInstructions(e.target.value), rows: 5, placeholder: "You are a helpful assistant that...", className: "w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none font-mono" })] }), _jsxs("div", { className: "space-y-1.5", children: [_jsx("label", { className: "text-sm font-medium", children: "Model" }), _jsxs("div", { className: "flex gap-2", children: [_jsx("select", { value: providerId, onChange: (e) => { setProviderId(e.target.value); setModelId(""); }, className: "flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring", children: providers.map((p) => (_jsx("option", { value: p.id, children: p.name }, p.id))) }), providerModels.length > 0 ? (_jsx("select", { value: modelId, onChange: (e) => setModelId(e.target.value), className: "flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring", children: providerModels.map((m) => (_jsx("option", { value: m.id, children: m.name }, m.id))) })) : (_jsx("input", { value: modelId, onChange: (e) => setModelId(e.target.value), placeholder: "Model ID (e.g. gpt-4o)", className: "flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" }))] })] }), _jsxs("div", { className: "space-y-1.5", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("label", { className: "text-sm font-medium", children: ["Tools (", selectedTools.length, " selected)"] }), _jsxs("div", { className: "relative", children: [_jsx(Search, { className: "absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" }), _jsx("input", { value: toolSearch, onChange: (e) => setToolSearch(e.target.value), placeholder: "Filter tools...", className: "pl-6 pr-2 py-1 text-xs rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-ring" })] })] }), _jsxs("div", { className: "border border-border rounded-lg overflow-hidden max-h-48 overflow-y-auto", children: [filteredTools.map((tool) => (_jsxs("label", { className: cn("flex items-start gap-3 px-3 py-2 cursor-pointer hover:bg-muted/50 border-b border-border last:border-0 transition-colors", selectedTools.includes(tool.name) && "bg-primary/5"), children: [_jsx("div", { className: cn("mt-0.5 h-4 w-4 shrink-0 rounded border flex items-center justify-center", selectedTools.includes(tool.name) ? "bg-primary border-primary text-primary-foreground" : "border-border"), children: selectedTools.includes(tool.name) && _jsx(Check, { className: "h-3 w-3" }) }), _jsx("input", { type: "checkbox", className: "sr-only", checked: selectedTools.includes(tool.name), onChange: () => toggleTool(tool.name) }), _jsxs("div", { className: "min-w-0", children: [_jsx("div", { className: "text-sm font-mono text-xs font-medium", children: tool.name }), _jsx("div", { className: "text-xs text-muted-foreground truncate", children: tool.description })] })] }, tool.name))), filteredTools.length === 0 && (_jsx("div", { className: "py-4 text-center text-sm text-muted-foreground", children: "No tools match" }))] })] }), _jsxs("div", { className: "space-y-1.5", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("label", { className: "text-sm font-medium flex items-center gap-1.5", children: [_jsx(FileText, { className: "h-4 w-4" }), "Skill Files", _jsx("span", { className: "text-xs font-normal text-muted-foreground ml-1", children: "(markdown context pre-loaded into this agent, like CLAUDE.md)" })] }), _jsxs("button", { type: "button", onClick: () => {
                                                setSkillFiles((prev) => [...prev, { name: "New Skill", content: "" }]);
                                                setEditingSkillIdx(skillFiles.length);
                                            }, className: "flex items-center gap-1 text-xs px-2 py-1 rounded border border-dashed border-border hover:bg-muted transition-colors", children: [_jsx(Plus, { className: "h-3 w-3" }), " Add skill file"] })] }), skillFiles.length === 0 && (_jsx("p", { className: "text-xs text-muted-foreground py-2", children: "No skill files. Add markdown documents (e.g. project conventions, style guides) to pre-load as context." })), _jsx("div", { className: "space-y-2", children: skillFiles.map((sf, idx) => (_jsxs("div", { className: "rounded-lg border border-border overflow-hidden", children: [_jsxs("div", { className: "flex items-center gap-2 px-3 py-2 bg-muted/40 border-b border-border", children: [_jsx(FileText, { className: "h-3.5 w-3.5 text-muted-foreground shrink-0" }), editingSkillIdx === idx ? (_jsx("input", { autoFocus: true, value: sf.name, onChange: (e) => setSkillFiles((prev) => prev.map((s, i) => (i === idx ? { ...s, name: e.target.value } : s))), className: "flex-1 text-sm bg-transparent border-none outline-none", placeholder: "Skill file name (e.g. CONVENTIONS.md)" })) : (_jsx("span", { className: "flex-1 text-sm font-medium", children: sf.name || "Untitled" })), _jsx("button", { type: "button", onClick: () => setEditingSkillIdx(editingSkillIdx === idx ? null : idx), className: "p-0.5 hover:text-foreground text-muted-foreground transition-colors", title: editingSkillIdx === idx ? "Collapse" : "Edit", children: _jsx(ChevronDown, { className: cn("h-3.5 w-3.5 transition-transform", editingSkillIdx === idx && "rotate-180") }) }), _jsx("button", { type: "button", onClick: () => {
                                                            setSkillFiles((prev) => prev.filter((_, i) => i !== idx));
                                                            if (editingSkillIdx === idx)
                                                                setEditingSkillIdx(null);
                                                        }, className: "p-0.5 hover:text-destructive text-muted-foreground transition-colors", title: "Remove skill file", children: _jsx(Trash2, { className: "h-3.5 w-3.5" }) })] }), editingSkillIdx === idx && (_jsx("textarea", { value: sf.content, onChange: (e) => setSkillFiles((prev) => prev.map((s, i) => (i === idx ? { ...s, content: e.target.value } : s))), rows: 8, placeholder: "Enter markdown content for this skill file...", className: "w-full px-3 py-2 text-sm font-mono bg-background focus:outline-none resize-y" }))] }, idx))) })] }), _jsxs("div", { className: "grid grid-cols-2 gap-4", children: [_jsxs("div", { className: "space-y-1.5", children: [_jsx("label", { className: "text-sm font-medium", children: "RAG / Knowledge Base" }), _jsxs("label", { className: "flex items-center gap-2 cursor-pointer", children: [_jsx("div", { onClick: () => setRagEnabled((v) => !v), className: cn("h-5 w-9 rounded-full transition-colors relative", ragEnabled ? "bg-primary" : "bg-muted"), children: _jsx("div", { className: cn("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform", ragEnabled ? "translate-x-4" : "translate-x-0.5") }) }), _jsx("span", { className: "text-sm text-muted-foreground", children: "Enable RAG search" })] })] }), _jsxs("div", { className: "space-y-1.5", children: [_jsx("label", { className: "text-sm font-medium", children: "Tags (comma-separated)" }), _jsx("input", { value: tags, onChange: (e) => setTags(e.target.value), placeholder: "code, python, analysis", className: "w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" })] })] })] }), _jsxs("div", { className: "flex justify-end gap-2 px-6 py-4 border-t border-border", children: [_jsx("button", { type: "button", onClick: onClose, className: "px-4 py-2 text-sm rounded-md border border-border hover:bg-muted transition-colors", children: "Cancel" }), _jsx("button", { type: "submit", form: "agent-form", onClick: handleSubmit, className: "px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors", children: initial ? "Save Changes" : "Create Agent" })] })] }) }));
}
// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function AgentsPage() {
    const { agents, createAgent, updateAgent, deleteAgent, duplicateAgent } = useAgentStore();
    const navigate = useNavigate();
    const createConversation = useConversationStore((s) => s.createConversation);
    const { currentWorkspaceId } = useWorkspaceStore();
    const importRef = useRef(null);
    const [showBuilder, setShowBuilder] = useState(false);
    const [editTarget, setEditTarget] = useState();
    const [search, setSearch] = useState("");
    const [filterTag, setFilterTag] = useState(null);
    const allTags = Array.from(new Set(agents.flatMap((a) => a.tags ?? [])));
    const filtered = agents.filter((a) => {
        const matchesSearch = search === "" ||
            a.name.toLowerCase().includes(search.toLowerCase()) ||
            a.description.toLowerCase().includes(search.toLowerCase());
        const matchesTag = filterTag === null || (a.tags ?? []).includes(filterTag);
        return matchesSearch && matchesTag;
    });
    function handleUseAgent(agentId) {
        const convId = createConversation({
            workspaceId: currentWorkspaceId ?? "default",
            agentId,
        });
        void navigate(`/chat/${convId}`);
    }
    function handleEdit(agent) {
        setEditTarget(agent);
        setShowBuilder(true);
    }
    function handleSave(data) {
        if (editTarget) {
            updateAgent(editTarget.id, data);
            toast.success("Agent updated");
        }
        else {
            createAgent(data);
            toast.success("Agent created");
        }
        setEditTarget(undefined);
    }
    function handleDelete(agent) {
        if (agent.isBuiltIn)
            return;
        if (!confirm(`Delete agent "${agent.name}"?`))
            return;
        deleteAgent(agent.id);
        toast.success("Agent deleted");
    }
    function handleDuplicate(agent) {
        duplicateAgent(agent.id);
        toast.success(`Duplicated "${agent.name}"`);
    }
    function handleExport(agent) {
        const blob = new Blob([JSON.stringify(agent, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${agent.name.toLowerCase().replace(/\s+/g, "-")}.agent.json`;
        a.click();
        URL.revokeObjectURL(url);
    }
    function handleImport(e) {
        const file = e.target.files?.[0];
        if (!file)
            return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const data = JSON.parse(ev.target?.result);
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
            }
            catch {
                toast.error("Invalid agent file");
            }
        };
        reader.readAsText(file);
        e.target.value = "";
    }
    return (_jsxs("div", { className: "flex h-full flex-col overflow-hidden", children: [_jsxs("div", { className: "border-b border-border px-6 py-4 shrink-0", children: [_jsxs("div", { className: "flex items-center justify-between gap-4", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-lg font-semibold", children: "Agents" }), _jsx("p", { className: "text-sm text-muted-foreground", children: "Pre-configured AI assistants with specific tools and instructions" })] }), _jsxs("div", { className: "flex gap-2", children: [_jsx("input", { ref: importRef, type: "file", accept: ".json", className: "sr-only", onChange: handleImport }), _jsxs("button", { onClick: () => importRef.current?.click(), className: "flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted transition-colors", children: [_jsx(Upload, { className: "h-4 w-4" }), "Import"] }), _jsxs("button", { onClick: () => { setEditTarget(undefined); setShowBuilder(true); }, className: "flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm hover:bg-primary/90 transition-colors", children: [_jsx(Plus, { className: "h-4 w-4" }), "New Agent"] })] })] }), _jsxs("div", { className: "mt-3 flex flex-wrap items-center gap-2", children: [_jsxs("div", { className: "relative flex-1 min-w-48", children: [_jsx(Search, { className: "absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" }), _jsx("input", { value: search, onChange: (e) => setSearch(e.target.value), placeholder: "Search agents...", className: "w-full pl-8 pr-3 py-1.5 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring" })] }), _jsxs("div", { className: "flex flex-wrap gap-1", children: [_jsx("button", { onClick: () => setFilterTag(null), className: cn("px-2.5 py-1 rounded-full text-xs font-medium transition-colors", filterTag === null ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"), children: "All" }), allTags.map((tag) => (_jsx("button", { onClick: () => setFilterTag(filterTag === tag ? null : tag), className: cn("px-2.5 py-1 rounded-full text-xs font-medium transition-colors", filterTag === tag ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"), children: tag }, tag)))] })] })] }), _jsx("div", { className: "flex-1 overflow-y-auto px-6 py-6", children: filtered.length === 0 ? (_jsxs("div", { className: "flex flex-col items-center justify-center h-full gap-3 text-muted-foreground", children: [_jsx(Bot, { className: "h-12 w-12 opacity-20" }), _jsx("p", { className: "text-sm", children: "No agents match your search" })] })) : (_jsx("div", { className: "grid gap-4 sm:grid-cols-2 lg:grid-cols-3", children: filtered.map((agent) => (_jsxs("div", { className: "group rounded-xl border border-border bg-card p-4 flex flex-col gap-3 hover:border-primary/30 transition-colors", children: [_jsxs("div", { className: "flex items-start gap-3", children: [_jsx("div", { className: "flex h-11 w-11 items-center justify-center rounded-lg bg-muted text-2xl shrink-0", children: agent.avatar }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("h3", { className: "font-medium truncate text-sm", children: agent.name }), agent.isBuiltIn && (_jsx("span", { className: "shrink-0 text-[10px] bg-muted text-muted-foreground rounded px-1.5 py-0.5", children: "built-in" })), agent.ragEnabled && (_jsx("span", { className: "shrink-0 text-[10px] bg-blue-500/10 text-blue-500 rounded px-1.5 py-0.5", children: "RAG" }))] }), _jsx("p", { className: "text-xs text-muted-foreground line-clamp-2 mt-0.5", children: agent.description })] })] }), agent.tools.length > 0 && (_jsxs("div", { className: "flex flex-wrap gap-1", children: [agent.tools.slice(0, 4).map((tool) => (_jsx("span", { className: "text-[10px] bg-muted rounded px-1.5 py-0.5 font-mono text-muted-foreground", children: tool }, tool))), agent.tools.length > 4 && (_jsxs("span", { className: "text-[10px] text-muted-foreground", children: ["+", agent.tools.length - 4, " more"] }))] })), agent.tags && agent.tags.length > 0 && (_jsx("div", { className: "flex flex-wrap gap-1", children: agent.tags.map((tag) => (_jsx("span", { className: "text-[10px] bg-primary/10 text-primary rounded-full px-2 py-0.5", children: tag }, tag))) })), _jsxs("div", { className: "mt-auto flex gap-2", children: [_jsx("button", { onClick: () => handleUseAgent(agent.id), className: "flex-1 rounded-md bg-primary/10 text-primary hover:bg-primary/20 px-3 py-1.5 text-sm font-medium transition-colors", children: "Start Chat" }), _jsxs("div", { className: "flex gap-1", children: [!agent.isBuiltIn && (_jsx("button", { onClick: () => handleEdit(agent), title: "Edit", className: "p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors", children: _jsx(Pencil, { className: "h-3.5 w-3.5" }) })), _jsx("button", { onClick: () => handleDuplicate(agent), title: "Duplicate", className: "p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors", children: _jsx(Copy, { className: "h-3.5 w-3.5" }) }), _jsx("button", { onClick: () => handleExport(agent), title: "Export JSON", className: "p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors", children: _jsx(Download, { className: "h-3.5 w-3.5" }) }), !agent.isBuiltIn && (_jsx("button", { onClick: () => handleDelete(agent), title: "Delete", className: "p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors", children: _jsx(Trash2, { className: "h-3.5 w-3.5" }) }))] })] })] }, agent.id))) })) }), showBuilder && (_jsx(AgentBuilder, { initial: editTarget, onClose: () => { setShowBuilder(false); setEditTarget(undefined); }, onSave: handleSave }))] }));
}
