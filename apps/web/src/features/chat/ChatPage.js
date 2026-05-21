import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useParams, useOutletContext, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, Loader2, PanelLeft, Wrench, ChevronDown, Bot, BookOpen, Download, Plus } from "lucide-react";
import { useConversationStore } from "@/store/conversationStore";
import { useAgentStore } from "@/store/agentStore";
import { useProviderStore } from "@/store/providerStore";
import { useLocalModelStore } from "@/store/localModelStore";
import { useMcpStore } from "@/store/mcpStore";
import { useSkillStore } from "@/store/skillStore";
import { MessageList } from "./MessageList";
import { ChatInput } from "./ChatInput";
import { ModelSelector } from "./ModelSelector";
import { runAgent } from "@/lib/agent/runner";
import { toast } from "@/components/ui/Toaster";
import { cn } from "@/lib/utils";
import { toolRegistry } from "@/lib/tools/registry";
// ─── Approximate per-token costs (USD per 1M tokens) for common models ───────
const MODEL_PRICING = {
    "gpt-4o": { input: 2.5, output: 10, cacheRead: 1.25 },
    "gpt-4o-mini": { input: 0.15, output: 0.6, cacheRead: 0.075 },
    "gpt-4-turbo": { input: 10, output: 30 },
    "gpt-3.5-turbo": { input: 0.5, output: 1.5 },
    "claude-opus-4": { input: 15, output: 75, cacheRead: 1.5 },
    "claude-sonnet-4-5": { input: 3, output: 15, cacheRead: 0.3 },
    "claude-haiku-4-5": { input: 0.8, output: 4, cacheRead: 0.08 },
    "claude-3-5-sonnet-20241022": { input: 3, output: 15, cacheRead: 0.3 },
    "claude-3-5-haiku-20241022": { input: 0.8, output: 4, cacheRead: 0.08 },
    "claude-3-opus-20240229": { input: 15, output: 75, cacheRead: 1.5 },
    "gemini-1.5-pro": { input: 1.25, output: 5 },
    "gemini-1.5-flash": { input: 0.075, output: 0.3 },
    "gemini-2.0-flash": { input: 0.1, output: 0.4 },
};
function estimateCost(modelId, inputTokens, outputTokens, cacheReadTokens = 0) {
    const pricing = MODEL_PRICING[modelId];
    if (!pricing)
        return null;
    const inputCost = (inputTokens * pricing.input) / 1_000_000;
    const outputCost = (outputTokens * pricing.output) / 1_000_000;
    const cacheCost = cacheReadTokens > 0 && pricing.cacheRead ? (cacheReadTokens * pricing.cacheRead) / 1_000_000 : 0;
    return inputCost + outputCost + cacheCost;
}
function formatCost(usd) {
    if (usd < 0.001)
        return `<$0.001`;
    if (usd < 0.01)
        return `$${usd.toFixed(4)}`;
    return `$${usd.toFixed(3)}`;
}
export default function ChatPage() {
    const { conversationId } = useParams();
    const { sidebarOpen, setSidebarOpen } = useOutletContext();
    const navigate = useNavigate();
    const getConversation = useConversationStore((s) => s.getConversation);
    const createConversation = useConversationStore((s) => s.createConversation);
    const addMessage = useConversationStore((s) => s.addMessage);
    const updateMessage = useConversationStore((s) => s.updateMessage);
    const appendToMessage = useConversationStore((s) => s.appendToMessage);
    const truncateAfterMessage = useConversationStore((s) => s.truncateAfterMessage);
    const setConversationAgent = useConversationStore((s) => s.setConversationAgent);
    const agents = useAgentStore((s) => s.agents);
    const getAgent = useAgentStore((s) => s.getAgent);
    const providers = useProviderStore((s) => s.providers);
    const selectedProviderId = useProviderStore((s) => s.selectedProviderId);
    const selectedModelId = useProviderStore((s) => s.selectedModelId);
    const setSelectedModel = useProviderStore((s) => s.setSelectedModel);
    const localModelStatus = useLocalModelStore((s) => s.status);
    const localModelId = useLocalModelStore((s) => s.modelId);
    const localModelLoadingText = useLocalModelStore((s) => s.loadingText);
    const localModelProgress = useLocalModelStore((s) => s.progress);
    const localModelError = useLocalModelStore((s) => s.error);
    const webGPUSupported = useLocalModelStore((s) => s.webGPUSupported);
    const checkWebGPU = useLocalModelStore((s) => s.checkWebGPU);
    const loadLocalModel = useLocalModelStore((s) => s.loadModel);
    const mcpServers = useMcpStore((s) => s.servers);
    const allSkills = useSkillStore((s) => s.skills);
    const [isStreaming, setIsStreaming] = useState(false);
    const [streamingMsgId, setStreamingMsgId] = useState(null);
    const [agentStatus, setAgentStatus] = useState(null);
    const [selectedTools, setSelectedTools] = useState([]);
    // null = use global enabled state; array = per-conversation override
    const [selectedSkillIds, setSelectedSkillIds] = useState(null);
    const abortControllerRef = useRef(null);
    const conversation = conversationId ? getConversation(conversationId) : null;
    const agent = conversation?.agentId
        ? getAgent(conversation.agentId)
        : getAgent("general");
    const selectedProvider = useMemo(() => providers.find((provider) => provider.id === selectedProviderId), [providers, selectedProviderId]);
    const isLocalWebGPUSelected = selectedProvider?.type === "local-webgpu";
    const isLocalModelReady = localModelStatus === "ready" &&
        localModelId === selectedModelId;
    const availableTools = useMemo(() => toolRegistry.getAll(), [mcpServers]);
    // Initialize per-conversation skills from global enabled state on first render
    useEffect(() => {
        if (selectedSkillIds === null) {
            setSelectedSkillIds(allSkills.filter((s) => s.enabled).map((s) => s.id));
        }
    }, [allSkills, selectedSkillIds]);
    useEffect(() => {
        setSelectedTools(agent?.tools ?? []);
    }, [agent?.id]);
    useEffect(() => {
        if (isLocalWebGPUSelected && webGPUSupported === null) {
            void checkWebGPU();
        }
    }, [checkWebGPU, isLocalWebGPUSelected, webGPUSupported]);
    // Redirect to new chat if no conversation
    useEffect(() => {
        if (!conversationId)
            return;
        if (!getConversation(conversationId)) {
            void navigate("/chat", { replace: true });
        }
    }, [conversationId, getConversation, navigate]);
    const startAssistantRun = async (activeConvId, historyMessages) => {
        if (!agent)
            return;
        const assistantMsgId = addMessage(activeConvId, {
            role: "assistant",
            content: [{ type: "text", text: "" }],
            modelId: selectedModelId,
            providerId: selectedProviderId,
        });
        setStreamingMsgId(assistantMsgId);
        setIsStreaming(true);
        setAgentStatus("Thinking…");
        const controller = new AbortController();
        abortControllerRef.current = controller;
        const effectiveAgent = {
            ...agent,
            model: { providerId: selectedProviderId, modelId: selectedModelId },
            tools: selectedTools,
        };
        const appendAssistantBlock = (block) => {
            const current = getConversation(activeConvId)?.messages.find((m) => m.id === assistantMsgId);
            const content = current?.content ?? [];
            if (block.type === "tool_use" &&
                content.some((existing) => existing.type === "tool_use" &&
                    existing.toolCallId === block.toolCallId)) {
                return;
            }
            updateMessage(activeConvId, assistantMsgId, {
                content: [...content, block],
            });
        };
        // Accumulate thinking text and keep the thinking block in sync
        let thinkingAccumulator = "";
        try {
            await runAgent({
                conversation: {
                    id: activeConvId,
                    messages: historyMessages,
                },
                agent: effectiveAgent,
                selectedSkillIds: selectedSkillIds ?? undefined,
                signal: controller.signal,
                onThinking: (text) => {
                    setAgentStatus("Reasoning…");
                    thinkingAccumulator += text;
                    const current = getConversation(activeConvId)?.messages.find((m) => m.id === assistantMsgId);
                    if (!current)
                        return;
                    const hasThinking = current.content.some((b) => b.type === "thinking");
                    if (!hasThinking) {
                        updateMessage(activeConvId, assistantMsgId, {
                            content: [
                                { type: "thinking", thinking: thinkingAccumulator },
                                ...current.content,
                            ],
                        });
                    }
                    else {
                        updateMessage(activeConvId, assistantMsgId, {
                            content: current.content.map((b) => b.type === "thinking"
                                ? { type: "thinking", thinking: thinkingAccumulator }
                                : b),
                        });
                    }
                },
                onChunk: (text) => {
                    setAgentStatus("Responding…");
                    appendToMessage(activeConvId, assistantMsgId, text);
                },
                onToolCall: (toolCall) => {
                    setAgentStatus(`Calling ${toolCall.toolName}…`);
                    appendAssistantBlock({
                        type: "tool_use",
                        toolCallId: toolCall.id,
                        toolName: toolCall.toolName,
                        toolInput: toolCall.input,
                    });
                },
                onToolResult: (result) => {
                    setAgentStatus(`Done: ${result.toolName}`);
                    addMessage(activeConvId, {
                        role: "tool",
                        content: [
                            {
                                type: "tool_result",
                                toolCallId: result.toolCallId,
                                toolName: result.toolName,
                                isError: result.isError,
                                content: result.content,
                            },
                        ],
                    });
                },
                onRetry: (attempt, maxAttempts, error) => {
                    setAgentStatus(`Error — retrying (${attempt}/${maxAttempts}): ${error.message.slice(0, 60)}`);
                },
                onComplete: (usage) => {
                    if (usage) {
                        updateMessage(activeConvId, assistantMsgId, { usage });
                    }
                    setIsStreaming(false);
                    setStreamingMsgId(null);
                    setAgentStatus(null);
                },
                onError: (error) => {
                    const currentMsg = getConversation(activeConvId)?.messages.find((m) => m.id === assistantMsgId);
                    const currentText = currentMsg?.content
                        .filter((block) => block.type === "text")
                        .map((block) => (block.type === "text" ? block.text : ""))
                        .join("") ?? "";
                    const thinkingBlocks = currentMsg?.content.filter((b) => b.type === "thinking") ?? [];
                    let errorText;
                    let toastMsg = null;
                    if (error.name === "AbortError") {
                        errorText = `${currentText} _(stopped)_`.trim();
                    }
                    else if (error instanceof TypeError && error.message.toLowerCase().includes("fetch")) {
                        // Network/CORS failure — provide specific guidance
                        errorText = `${currentText}\n\n❌ **Connection failed** — could not reach the AI provider.\n\nPossible causes:\n- No internet connection\n- Invalid or missing API key (check Settings)\n- Provider service is down`.trim();
                        toastMsg = "Connection failed — check your API key and network";
                    }
                    else if (error.message.includes("401") || error.message.toLowerCase().includes("unauthorized") || error.message.toLowerCase().includes("invalid api key")) {
                        errorText = `${currentText}\n\n❌ **Authentication failed (401)** — your API key is invalid or expired.\n\nGo to Settings → Providers and update the key.`.trim();
                        toastMsg = "Invalid API key — update it in Settings → Providers";
                    }
                    else if (error.message.includes("429") || error.message.toLowerCase().includes("rate limit")) {
                        errorText = `${currentText}\n\n❌ **Rate limit hit (429)** — too many requests. Please wait a moment and retry.`.trim();
                        toastMsg = "Rate limit reached — please wait before retrying";
                    }
                    else if (error.message.includes("No API key")) {
                        errorText = `${currentText}\n\n❌ **No API key configured.**\n\nGo to Settings → Providers and add a key for this provider.`.trim();
                        toastMsg = error.message;
                    }
                    else {
                        errorText = `${currentText}\n\n❌ ${error.message}`.trim();
                    }
                    updateMessage(activeConvId, assistantMsgId, {
                        content: [
                            ...thinkingBlocks,
                            { type: "text", text: errorText },
                        ],
                    });
                    if (toastMsg)
                        toast.error("Request failed", toastMsg);
                    setIsStreaming(false);
                    setStreamingMsgId(null);
                    setAgentStatus(null);
                },
            });
        }
        catch (err) {
            setIsStreaming(false);
            setStreamingMsgId(null);
            setAgentStatus(null);
        }
    };
    const handleSend = async (content, attachments) => {
        if (isStreaming)
            return;
        if (!content.trim() && (!attachments || attachments.length === 0))
            return;
        let activeConvId = conversationId;
        if (!activeConvId) {
            activeConvId = createConversation({
                workspaceId: "default",
                model: { providerId: selectedProviderId, modelId: selectedModelId },
            });
            void navigate(`/chat/${activeConvId}`, { replace: true });
        }
        void attachments;
        addMessage(activeConvId, {
            role: "user",
            content: [{ type: "text", text: content }],
            modelId: selectedModelId,
            providerId: selectedProviderId,
        });
        const conv = getConversation(activeConvId);
        if (!conv)
            return;
        await startAssistantRun(activeConvId, conv.messages);
    };
    const handleStop = () => {
        abortControllerRef.current?.abort();
    };
    const handleEditMessage = (messageId, text) => {
        if (!conversationId || isStreaming)
            return;
        const conv = getConversation(conversationId);
        const message = conv?.messages.find((m) => m.id === messageId);
        if (!conv || !message || message.role !== "user")
            return;
        updateMessage(conversationId, messageId, {
            content: [{ type: "text", text }],
        });
        truncateAfterMessage(conversationId, messageId);
        const updated = getConversation(conversationId);
        if (!updated)
            return;
        void startAssistantRun(conversationId, updated.messages);
    };
    const handleRetryMessage = (messageId) => {
        if (!conversationId || isStreaming)
            return;
        const conv = getConversation(conversationId);
        if (!conv)
            return;
        const messageIndex = conv.messages.findIndex((m) => m.id === messageId);
        if (messageIndex < 0)
            return;
        const userMessage = conv.messages[messageIndex]?.role === "user"
            ? conv.messages[messageIndex]
            : [...conv.messages]
                .slice(0, messageIndex)
                .reverse()
                .find((m) => m.role === "user");
        if (!userMessage)
            return;
        truncateAfterMessage(conversationId, userMessage.id);
        const updated = getConversation(conversationId);
        if (!updated)
            return;
        void startAssistantRun(conversationId, updated.messages);
    };
    const messages = conversation?.messages ?? [];
    const handleExport = () => {
        if (!conversation || messages.length === 0)
            return;
        const title = conversation.title || "conversation";
        const lines = [`# ${title}`, ""];
        for (const msg of messages) {
            if (msg.role === "system" || msg.role === "tool")
                continue;
            const roleLabel = msg.role === "user" ? "**You**" : `**Assistant** _(${msg.modelId ?? "AI"})_`;
            lines.push(`### ${roleLabel}`);
            for (const block of msg.content) {
                if (block.type === "text")
                    lines.push(block.text);
                else if (block.type === "thinking")
                    lines.push(`> 💭 _Reasoning:_\n> ${block.thinking.replace(/\n/g, "\n> ")}`);
                else if (block.type === "tool_use")
                    lines.push(`> 🔧 \`${block.toolName}\``);
            }
            if (msg.usage) {
                lines.push(``, `_↑${msg.usage.inputTokens} ↓${msg.usage.outputTokens} tokens_`);
            }
            lines.push("");
        }
        const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.md`;
        a.click();
        URL.revokeObjectURL(url);
    };
    return (_jsxs("div", { className: "flex h-full flex-col", children: [_jsxs("div", { className: "flex items-center gap-2 border-b border-border px-4 py-2", children: [!sidebarOpen && (_jsx("button", { onClick: () => setSidebarOpen(true), className: "p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground", "aria-label": "Open sidebar", children: _jsx(PanelLeft, { className: "h-4 w-4" }) })), _jsxs("div", { className: "flex items-center gap-2 ml-auto", children: [agentStatus && (_jsxs("span", { className: cn("flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors", agentStatus.startsWith("Error") || agentStatus.startsWith("❌")
                                    ? "bg-destructive/10 text-destructive"
                                    : agentStatus.startsWith("Responding")
                                        ? "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                                        : agentStatus.startsWith("Reasoning")
                                            ? "bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300"
                                            : agentStatus.startsWith("Calling") || agentStatus.startsWith("Done")
                                                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                                                : "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"), children: [agentStatus.startsWith("Error") ? (_jsx(AlertTriangle, { className: "h-3 w-3 shrink-0" })) : agentStatus.startsWith("Done") ? (_jsx(Check, { className: "h-3 w-3 shrink-0" })) : (_jsx(Loader2, { className: "h-3 w-3 shrink-0 animate-spin" })), agentStatus] })), messages.length > 0 && (_jsx("button", { onClick: handleExport, className: "p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground", "aria-label": "Export conversation", title: "Download conversation as Markdown", children: _jsx(Download, { className: "h-4 w-4" }) })), _jsx(AgentSelector, { agents: agents, selectedAgentId: conversation?.agentId ?? "general", disabled: isStreaming, onChange: (agentId) => {
                                    if (conversationId) {
                                        setConversationAgent(conversationId, agentId);
                                    }
                                    setSelectedTools(getAgent(agentId)?.tools ?? []);
                                } }), _jsx(SkillSelector, { skills: allSkills, selectedSkillIds: selectedSkillIds ?? allSkills.filter((s) => s.enabled).map((s) => s.id), onChange: setSelectedSkillIds }), _jsx(ToolSelector, { tools: availableTools, selectedTools: selectedTools, mcpServers: mcpServers, onChange: setSelectedTools }), _jsx(ModelSelector, { selectedProviderId: selectedProviderId, selectedModelId: selectedModelId, onSelect: setSelectedModel })] })] }), isLocalWebGPUSelected && (_jsx("div", { className: "border-b border-border bg-muted/30 px-4 py-2 text-xs", children: webGPUSupported === false ? (_jsxs("div", { className: "flex items-center gap-2 text-destructive", children: [_jsx(Bot, { className: "h-3.5 w-3.5" }), "WebGPU is not supported in this browser."] })) : localModelStatus === "loading" ? (_jsxs("div", { className: "flex flex-wrap items-center gap-2 text-muted-foreground", children: [_jsx(Bot, { className: "h-3.5 w-3.5 animate-pulse" }), _jsx("span", { children: localModelLoadingText || "Loading local model…" }), _jsxs("span", { className: "rounded bg-background px-2 py-0.5 font-mono text-[10px] text-foreground/70", children: [Math.round(localModelProgress), "%"] })] })) : isLocalModelReady ? (_jsxs("div", { className: "flex items-center gap-2 text-emerald-600 dark:text-emerald-400", children: [_jsx(Check, { className: "h-3.5 w-3.5" }), "Local model ready."] })) : (_jsxs("div", { className: "flex flex-wrap items-center gap-3", children: [_jsx("span", { className: "text-muted-foreground", children: localModelError || "Local model not loaded." }), _jsx("button", { onClick: () => void loadLocalModel(selectedModelId), disabled: isStreaming, className: "rounded border border-border bg-background px-2 py-1 font-medium hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50", children: "Load Model" })] })) })), _jsx(MessageList, { messages: messages, streamingMsgId: streamingMsgId, isStreaming: isStreaming, onEditMessage: handleEditMessage, onRetryMessage: handleRetryMessage }), messages.length > 0 && (_jsx(ConversationStatusBar, { messages: messages, modelId: selectedModelId })), _jsx(ChatInput, { onSend: handleSend, onStop: handleStop, isStreaming: isStreaming, disabled: false })] }));
}
function ToolSelector({ tools, selectedTools, mcpServers, onChange, }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    const selected = new Set(selectedTools);
    useEffect(() => {
        if (!open)
            return;
        const handler = (e) => {
            if (ref.current && !ref.current.contains(e.target))
                setOpen(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [open]);
    const mcpNameById = new Map(mcpServers.map((server) => [server.id, server.name]));
    const toggle = (name) => {
        onChange(selected.has(name)
            ? selectedTools.filter((tool) => tool !== name)
            : [...selectedTools, name]);
    };
    const labelFor = (name) => {
        if (!name.startsWith("mcp:"))
            return name;
        const [, serverId, toolName] = name.split(":");
        return `${mcpNameById.get(serverId) ?? "MCP"} / ${toolName ?? name}`;
    };
    const localTools = tools.filter((tool) => !tool.definition.name.startsWith("mcp:"));
    const mcpTools = tools.filter((tool) => tool.definition.name.startsWith("mcp:"));
    return (_jsxs("div", { ref: ref, className: "relative", children: [_jsxs("button", { onClick: () => setOpen((v) => !v), className: "flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium hover:bg-accent transition-colors", children: [_jsx(Wrench, { className: "h-3.5 w-3.5" }), "Tools", _jsx("span", { className: "rounded bg-muted px-1 text-[10px] text-muted-foreground", children: selectedTools.length })] }), open && (_jsxs("div", { className: "absolute right-0 top-full z-50 mt-1 w-80 rounded-lg border border-border bg-popover shadow-lg", children: [_jsxs("div", { className: "flex items-center justify-between border-b border-border px-3 py-2", children: [_jsx("span", { className: "text-xs font-medium", children: "Active tools for this chat" }), _jsxs("div", { className: "flex gap-2", children: [_jsx("button", { onClick: () => onChange(tools.map((tool) => tool.definition.name)), className: "text-xs text-muted-foreground hover:text-foreground", children: "All" }), _jsx("button", { onClick: () => onChange([]), className: "text-xs text-muted-foreground hover:text-foreground", children: "None" })] })] }), _jsxs("div", { className: "max-h-96 overflow-y-auto py-1", children: [_jsx(ToolGroup, { title: "Local tools", tools: localTools, selected: selected, labelFor: labelFor, onToggle: toggle }), _jsx(ToolGroup, { title: "MCP tools", tools: mcpTools, selected: selected, labelFor: labelFor, onToggle: toggle, emptyText: "No MCP tools registered. Add and connect an MCP server in Settings." })] })] }))] }));
}
function ToolGroup({ title, tools, selected, labelFor, onToggle, emptyText = "No tools", }) {
    return (_jsxs("div", { className: "py-1", children: [_jsx("div", { className: "px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground", children: title }), tools.length === 0 ? (_jsx("div", { className: "px-3 py-2 text-xs text-muted-foreground", children: emptyText })) : (tools.map((tool) => (_jsxs("button", { onClick: () => onToggle(tool.definition.name), className: "flex w-full items-start gap-2 px-3 py-2 text-left text-xs hover:bg-accent", children: [_jsx("span", { className: cn("mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border", selected.has(tool.definition.name)
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border"), children: selected.has(tool.definition.name) && _jsx(Check, { className: "h-3 w-3" }) }), _jsxs("span", { className: "min-w-0", children: [_jsx("span", { className: "block font-mono font-medium", children: labelFor(tool.definition.name) }), _jsx("span", { className: "line-clamp-2 text-muted-foreground", children: tool.definition.description })] })] }, tool.definition.name))))] }));
}
function AgentSelector({ agents, selectedAgentId, disabled, onChange }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    const selected = agents.find((a) => a.id === selectedAgentId) ?? agents.find((a) => a.id === "general");
    useEffect(() => {
        if (!open)
            return;
        const handler = (e) => {
            if (ref.current && !ref.current.contains(e.target))
                setOpen(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [open]);
    return (_jsxs("div", { ref: ref, className: "relative", children: [_jsxs("button", { onClick: () => !disabled && setOpen((v) => !v), disabled: disabled, className: cn("flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium hover:bg-accent transition-colors", disabled && "opacity-50 cursor-not-allowed"), title: "Change agent", children: [_jsx("span", { className: "text-sm leading-none", children: selected?.avatar ?? "🤖" }), _jsx("span", { className: "hidden sm:inline", children: selected?.name ?? "Agent" }), _jsx(ChevronDown, { className: cn("h-3 w-3 transition-transform", open && "rotate-180") })] }), open && (_jsxs("div", { className: "absolute right-0 top-full z-50 mt-1 w-64 rounded-lg border border-border bg-popover shadow-lg overflow-hidden", children: [_jsx("div", { className: "px-3 py-2 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wider", children: "Select Agent" }), _jsx("div", { className: "max-h-72 overflow-y-auto py-1", children: agents.map((agent) => (_jsxs("button", { onClick: () => { onChange(agent.id); setOpen(false); }, className: cn("flex w-full items-start gap-2 px-3 py-2 text-left text-xs hover:bg-accent transition-colors", agent.id === selectedAgentId && "bg-accent"), children: [_jsx("span", { className: "text-base mt-0.5 shrink-0", children: agent.avatar }), _jsxs("span", { className: "min-w-0 flex-1", children: [_jsx("span", { className: "block font-medium text-sm truncate", children: agent.name }), _jsx("span", { className: "line-clamp-1 text-muted-foreground", children: agent.description })] }), agent.id === selectedAgentId && (_jsx(Check, { className: "h-3.5 w-3.5 text-primary shrink-0 mt-0.5" }))] }, agent.id))) })] }))] }));
}
function SkillSelector({ skills, selectedSkillIds, onChange }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    const navigate = useNavigate();
    const selected = new Set(selectedSkillIds);
    useEffect(() => {
        if (!open)
            return;
        const handler = (e) => {
            if (ref.current && !ref.current.contains(e.target))
                setOpen(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [open]);
    const toggle = (id) => {
        onChange(selected.has(id) ? selectedSkillIds.filter((s) => s !== id) : [...selectedSkillIds, id]);
    };
    const activeCount = selectedSkillIds.length;
    return (_jsxs("div", { ref: ref, className: "relative", children: [_jsxs("button", { onClick: () => setOpen((v) => !v), className: cn("flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium hover:bg-accent transition-colors", activeCount > 0 && skills.length > 0 && "border-primary/40"), title: "Manage active skills", children: [_jsx(BookOpen, { className: "h-3.5 w-3.5" }), "Skills", _jsx("span", { className: cn("rounded px-1 text-[10px]", activeCount > 0 ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"), children: activeCount }), _jsx(ChevronDown, { className: cn("h-3 w-3 text-muted-foreground transition-transform", open && "rotate-180") })] }), open && (_jsxs("div", { className: "absolute right-0 top-full z-50 mt-1 w-72 rounded-lg border border-border bg-popover shadow-lg", children: [_jsxs("div", { className: "flex items-center justify-between border-b border-border px-3 py-2", children: [_jsx("span", { className: "text-xs font-medium", children: "Active skills for this chat" }), _jsxs("div", { className: "flex gap-2", children: [_jsx("button", { onClick: () => onChange(skills.map((s) => s.id)), className: "text-xs text-muted-foreground hover:text-foreground", children: "All" }), _jsx("button", { onClick: () => onChange([]), className: "text-xs text-muted-foreground hover:text-foreground", children: "None" })] })] }), _jsx("div", { className: "max-h-72 overflow-y-auto py-1", children: skills.length === 0 ? (_jsx("div", { className: "px-3 py-4 text-center text-xs text-muted-foreground", children: "No skills defined yet." })) : (skills.map((skill) => (_jsxs("button", { onClick: () => toggle(skill.id), className: "flex w-full items-start gap-2 px-3 py-2 text-left text-xs hover:bg-accent", children: [_jsx("span", { className: cn("mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border", selected.has(skill.id) ? "border-primary bg-primary text-primary-foreground" : "border-border"), children: selected.has(skill.id) && _jsx(Check, { className: "h-3 w-3" }) }), _jsxs("span", { className: "min-w-0", children: [_jsx("span", { className: "block font-medium truncate", children: skill.name }), _jsxs("span", { className: "line-clamp-1 text-muted-foreground", children: [skill.content.slice(0, 60), skill.content.length > 60 ? "…" : ""] })] })] }, skill.id)))) }), _jsx("div", { className: "border-t border-border px-3 py-2", children: _jsxs("button", { onClick: () => { setOpen(false); void navigate("/settings", { state: { tab: "skills" } }); }, className: "flex w-full items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground", children: [_jsx(Plus, { className: "h-3.5 w-3.5" }), "Add new skill\u2026"] }) })] }))] }));
}
function ConversationStatusBar({ messages, modelId }) {
    const stats = useMemo(() => {
        let totalInput = 0;
        let totalOutput = 0;
        let totalCacheRead = 0;
        let totalCacheWrite = 0;
        let toolCallCount = 0;
        const toolsUsed = new Set();
        for (const msg of messages) {
            if (msg.usage) {
                totalInput += msg.usage.inputTokens;
                totalOutput += msg.usage.outputTokens;
                totalCacheRead += msg.usage.cacheReadTokens ?? 0;
                totalCacheWrite += msg.usage.cacheWriteTokens ?? 0;
            }
            for (const block of msg.content) {
                if (block.type === "tool_use") {
                    toolCallCount++;
                    toolsUsed.add(block.toolName);
                }
            }
        }
        const contextMessages = messages.filter((m) => m.role !== "system").length;
        const totalTokens = totalInput + totalOutput;
        const cost = totalTokens > 0 ? estimateCost(modelId, totalInput, totalOutput, totalCacheRead) : null;
        return { totalInput, totalOutput, totalCacheRead, totalCacheWrite, toolCallCount, toolsUsed, contextMessages, cost };
    }, [messages, modelId]);
    if (stats.totalInput === 0 && stats.toolCallCount === 0)
        return null;
    return (_jsxs("div", { className: "flex-none border-t border-border bg-muted/20 px-4 py-1 flex items-center gap-3 overflow-x-auto text-[10px] text-muted-foreground", children: [stats.totalInput > 0 && (_jsxs(_Fragment, { children: [_jsxs("span", { className: "flex items-center gap-1 shrink-0", title: "Input tokens", children: [_jsx("span", { className: "font-medium text-foreground/60", children: "\u2191" }), stats.totalInput.toLocaleString()] }), _jsxs("span", { className: "flex items-center gap-1 shrink-0", title: "Output tokens", children: [_jsx("span", { className: "font-medium text-foreground/60", children: "\u2193" }), stats.totalOutput.toLocaleString()] }), stats.totalCacheRead > 0 && (_jsxs("span", { className: "flex items-center gap-1 shrink-0 text-blue-500/70", title: "Cache read tokens", children: ["cache ", stats.totalCacheRead.toLocaleString()] })), _jsxs("span", { className: "flex items-center gap-1 shrink-0", title: "Total tokens", children: [_jsx("span", { className: "font-medium", children: "\u03A3" }), (stats.totalInput + stats.totalOutput).toLocaleString(), " tokens"] })] })), _jsxs("span", { className: "flex items-center gap-1 shrink-0", title: "Messages in context", children: [_jsx("span", { className: "font-medium", children: "ctx" }), stats.contextMessages] }), stats.toolCallCount > 0 && (_jsxs("span", { className: "flex items-center gap-1 shrink-0", title: `Tools used: ${Array.from(stats.toolsUsed).join(", ")}`, children: [_jsx(Wrench, { className: "h-2.5 w-2.5" }), stats.toolCallCount, " call", stats.toolCallCount !== 1 ? "s" : "", stats.toolsUsed.size > 0 && ` (${Array.from(stats.toolsUsed).join(", ")})`] })), stats.cost !== null && (_jsxs("span", { className: "flex items-center gap-1 shrink-0 ml-auto font-mono", title: "Estimated cost", children: ["~", formatCost(stats.cost)] }))] }));
}
