import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Copy, Check, ChevronDown, ChevronRight, Pencil, RefreshCw, Wrench, X, Brain, Loader2, AlertCircle, Info, } from "lucide-react";
import { cn } from "@/lib/utils";
export function MessageBubble({ message, isStreaming, toolResultMap, onEditMessage, onRetryMessage, }) {
    const isUser = message.role === "user";
    const isAssistant = message.role === "assistant";
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(() => getMessageText(message));
    const saveEdit = () => {
        const next = draft.trim();
        if (!next)
            return;
        onEditMessage(message.id, next);
        setEditing(false);
    };
    return (_jsxs("div", { className: cn("group flex gap-3 animate-fade-in", isUser && "flex-row-reverse"), children: [!isUser && (_jsx("div", { className: "mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm", children: isStreaming ? (_jsx(Loader2, { className: "h-3.5 w-3.5 animate-spin" })) : ("Z") })), _jsxs("div", { className: cn("flex max-w-[85%] flex-col gap-1.5", isUser && "items-end"), children: [editing && isUser ? (_jsxs("div", { className: "w-full min-w-[320px] rounded-2xl rounded-tr-sm bg-primary/10 p-2", children: [_jsx("textarea", { value: draft, onChange: (e) => setDraft(e.target.value), rows: Math.min(8, Math.max(2, draft.split("\n").length)), className: "w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring" }), _jsxs("div", { className: "mt-2 flex justify-end gap-2", children: [_jsxs("button", { onClick: () => { setDraft(getMessageText(message)); setEditing(false); }, className: "flex items-center gap-1 rounded border border-border px-2 py-1 text-xs hover:bg-muted", children: [_jsx(X, { className: "h-3 w-3" }), "Cancel"] }), _jsxs("button", { onClick: saveEdit, className: "flex items-center gap-1 rounded bg-primary px-2 py-1 text-xs text-primary-foreground hover:bg-primary/90", children: [_jsx(Check, { className: "h-3 w-3" }), "Save & retry"] })] })] })) : (message.content.map((block, i) => (_jsx(ContentBlock, { block: block, isUser: isUser, isStreaming: isStreaming && i === message.content.length - 1, toolResultMap: toolResultMap }, i)))), message.usage && !isStreaming && (_jsx(TokenUsageInfo, { usage: message.usage, modelId: message.modelId })), !editing && !isStreaming && (_jsxs("div", { className: cn("flex gap-1 opacity-0 transition-opacity group-hover:opacity-100", isUser && "justify-end"), children: [isUser && (_jsxs("button", { onClick: () => { setDraft(getMessageText(message)); setEditing(true); }, className: "flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground", children: [_jsx(Pencil, { className: "h-3 w-3" }), "Edit"] })), isAssistant && (_jsxs("button", { onClick: () => onRetryMessage(message.id), className: "flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground", children: [_jsx(RefreshCw, { className: "h-3 w-3" }), "Retry"] }))] }))] })] }));
}
// ─── Individual content block renderers ───────────────────────────────────────
function ContentBlock({ block, isUser, isStreaming, toolResultMap, }) {
    const [copied, setCopied] = useState(false);
    if (block.type === "thinking") {
        return _jsx(ThinkingBlock, { thinking: block.thinking, isStreaming: isStreaming });
    }
    if (block.type === "text") {
        // Show animated typing dots while waiting for the first token
        if (!block.text && isStreaming) {
            return (_jsx("div", { className: "rounded-2xl rounded-tl-sm bg-muted/60 px-4 py-3", children: _jsx(TypingDots, {}) }));
        }
        return (_jsxs("div", { className: cn("relative rounded-2xl px-4 py-2.5 text-sm", isUser
                ? "bg-primary text-primary-foreground rounded-tr-sm"
                : "bg-muted/60 rounded-tl-sm"), children: [isUser ? (_jsx("p", { className: "whitespace-pre-wrap", children: block.text })) : (_jsxs("div", { className: "prose prose-sm dark:prose-invert max-w-none", children: [_jsx(ReactMarkdown, { remarkPlugins: [remarkGfm], children: block.text }), isStreaming && (_jsx("span", { className: "inline-block h-4 w-0.5 bg-current animate-pulse ml-0.5 align-middle" }))] })), block.text && !isStreaming && (_jsx("button", { onClick: async () => {
                        await navigator.clipboard.writeText(block.text);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                    }, className: "absolute right-2 top-2 opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-opacity", "aria-label": "Copy", children: copied ? _jsx(Check, { className: "h-3.5 w-3.5" }) : _jsx(Copy, { className: "h-3.5 w-3.5" }) }))] }));
    }
    if (block.type === "tool_use") {
        const result = toolResultMap.get(block.toolCallId);
        return _jsx(ToolCallCard, { call: block, result: result, isStreaming: isStreaming });
    }
    if (block.type === "image") {
        return (_jsx("img", { src: block.url, alt: "attachment", className: "max-w-sm rounded-lg border border-border" }));
    }
    // tool_result is rendered inside ToolCallCard — never directly
    return null;
}
// ─── Typing dots (waiting for first token) ───────────────────────────────────
function TypingDots() {
    return (_jsx("div", { className: "flex items-center gap-1", "aria-label": "Typing\u2026", children: [0, 1, 2].map((i) => (_jsx("span", { className: "h-2 w-2 rounded-full bg-muted-foreground/50 animate-bounce", style: { animationDelay: `${i * 150}ms`, animationDuration: "0.9s" } }, i))) }));
}
// ─── Thinking block ───────────────────────────────────────────────────────────
function ThinkingBlock({ thinking, isStreaming }) {
    const [expanded, setExpanded] = useState(false);
    return (_jsxs("div", { className: "rounded-xl border border-amber-200/50 bg-amber-50/30 dark:border-amber-800/30 dark:bg-amber-950/20 text-xs overflow-hidden w-full", children: [_jsxs("button", { onClick: () => setExpanded((v) => !v), className: "flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-amber-100/30 dark:hover:bg-amber-900/20 transition-colors", children: [_jsx(Brain, { className: cn("h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0", isStreaming && "animate-pulse") }), _jsx("span", { className: "font-medium text-amber-700 dark:text-amber-400", children: isStreaming ? "Reasoning…" : "Reasoning" }), _jsx("span", { className: "ml-auto text-amber-500/60", children: expanded ? _jsx(ChevronDown, { className: "h-3.5 w-3.5" }) : _jsx(ChevronRight, { className: "h-3.5 w-3.5" }) })] }), expanded && (_jsx("div", { className: "border-t border-amber-200/40 dark:border-amber-800/30 bg-amber-50/20 dark:bg-amber-950/10 px-3 py-2", children: _jsxs("pre", { className: "whitespace-pre-wrap text-[11px] leading-relaxed text-amber-900/70 dark:text-amber-200/60 font-mono", children: [thinking, isStreaming && (_jsx("span", { className: "inline-block h-3 w-0.5 bg-amber-500 animate-pulse ml-0.5 align-middle" }))] }) }))] }));
}
// ─── Tool call + result card ──────────────────────────────────────────────────
function ToolCallCard({ call, result, isStreaming, }) {
    const [expanded, setExpanded] = useState(false);
    const isPending = !result && isStreaming;
    const hasError = result?.isError;
    return (_jsxs("div", { className: cn("rounded-xl border text-xs overflow-hidden w-full", hasError
            ? "border-destructive/40 bg-destructive/5"
            : "border-border bg-muted/25"), children: [_jsxs("button", { onClick: () => setExpanded((v) => !v), className: "flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/40 transition-colors", children: [isPending ? (_jsx(Loader2, { className: "h-3.5 w-3.5 text-primary animate-spin shrink-0" })) : hasError ? (_jsx(AlertCircle, { className: "h-3.5 w-3.5 text-destructive shrink-0" })) : (_jsx(Wrench, { className: "h-3.5 w-3.5 text-muted-foreground shrink-0" })), _jsx("span", { className: "font-mono font-medium", children: call.toolName }), isPending && (_jsx("span", { className: "text-muted-foreground italic", children: "running\u2026" })), hasError && (_jsx("span", { className: "text-destructive font-medium", children: "error" })), result && !hasError && (_jsx("span", { className: "text-green-600 dark:text-green-400 text-[10px]", children: "\u2713" })), _jsx("span", { className: "ml-auto text-muted-foreground/60", children: expanded ? _jsx(ChevronDown, { className: "h-3.5 w-3.5" }) : _jsx(ChevronRight, { className: "h-3.5 w-3.5" }) })] }), expanded && (_jsxs("div", { className: "border-t border-border divide-y divide-border/60", children: [_jsxs("div", { className: "px-3 py-2 bg-background/40", children: [_jsx("div", { className: "text-[10px] uppercase tracking-wider text-muted-foreground mb-1 font-medium", children: "Input" }), _jsx("pre", { className: "overflow-x-auto text-[11px] leading-relaxed", children: JSON.stringify(call.toolInput, null, 2) })] }), result ? (_jsxs("div", { className: cn("px-3 py-2", hasError ? "bg-destructive/5" : "bg-background/30"), children: [_jsx("div", { className: "text-[10px] uppercase tracking-wider text-muted-foreground mb-1 font-medium", children: hasError ? "Error" : "Output" }), _jsx(ToolResultBody, { content: result.content })] })) : (_jsxs("div", { className: "px-3 py-2 flex items-center gap-2 text-muted-foreground", children: [_jsx(Loader2, { className: "h-3 w-3 animate-spin" }), _jsx("span", { children: "Waiting for result\u2026" })] }))] }))] }));
}
// ─── Tool result body (text / stdout+stderr / images) ─────────────────────────
function ToolResultBody({ content }) {
    const parsed = parseToolResultContent(content);
    if (parsed) {
        return (_jsxs("div", { className: "space-y-1.5", children: [parsed.stdout && (_jsx("pre", { className: "overflow-x-auto whitespace-pre-wrap rounded bg-muted/60 px-2 py-1.5 text-[11px] max-h-64", children: parsed.stdout })), parsed.stderr && (_jsx("pre", { className: "overflow-x-auto whitespace-pre-wrap rounded bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive max-h-32", children: parsed.stderr })), parsed.figures.map((fig, idx) => (_jsx("img", { src: fig, alt: `figure ${idx + 1}`, className: "max-w-full rounded-md border border-border bg-white" }, idx)))] }));
    }
    return (_jsx("pre", { className: "overflow-x-auto whitespace-pre-wrap text-[11px] leading-relaxed max-h-64", children: content }));
}
function parseToolResultContent(content) {
    try {
        const parsed = JSON.parse(content);
        const figures = Array.isArray(parsed.figures)
            ? parsed.figures.filter((f) => typeof f === "string")
            : [];
        const stdout = typeof parsed.stdout === "string" ? parsed.stdout : undefined;
        const stderr = typeof parsed.stderr === "string" ? parsed.stderr : undefined;
        if (!stdout && !stderr && figures.length === 0)
            return null;
        return { stdout, stderr, figures };
    }
    catch {
        return null;
    }
}
// ─── Token Usage Info ─────────────────────────────────────────────────────────
const MODEL_PRICING = {
    "gpt-4o": { input: 2.5, output: 10, cacheRead: 1.25 },
    "gpt-4o-mini": { input: 0.15, output: 0.6, cacheRead: 0.075 },
    "gpt-4.1": { input: 2, output: 8, cacheRead: 0.5 },
    "gpt-4.1-mini": { input: 0.4, output: 1.6, cacheRead: 0.1 },
    "claude-opus-4-5": { input: 15, output: 75, cacheRead: 1.5 },
    "claude-sonnet-4-5": { input: 3, output: 15, cacheRead: 0.3 },
    "claude-haiku-4-5": { input: 0.8, output: 4, cacheRead: 0.08 },
    "claude-3-5-sonnet-20241022": { input: 3, output: 15, cacheRead: 0.3 },
    "claude-3-5-haiku-20241022": { input: 0.8, output: 4, cacheRead: 0.08 },
    "gemini-2.5-pro": { input: 1.25, output: 10 },
    "gemini-2.5-flash": { input: 0.075, output: 0.3 },
    "gemini-2.0-flash": { input: 0.1, output: 0.4 },
};
function estimateMessageCost(modelId, inputTokens, outputTokens, cacheReadTokens = 0) {
    if (!modelId)
        return null;
    const pricing = MODEL_PRICING[modelId];
    if (!pricing)
        return null;
    return ((inputTokens * pricing.input) / 1_000_000 +
        (outputTokens * pricing.output) / 1_000_000 +
        (cacheReadTokens > 0 && pricing.cacheRead ? (cacheReadTokens * pricing.cacheRead) / 1_000_000 : 0));
}
function TokenUsageInfo({ usage, modelId, }) {
    const [open, setOpen] = useState(false);
    const cost = estimateMessageCost(modelId, usage.inputTokens, usage.outputTokens, usage.cacheReadTokens);
    return (_jsxs("div", { className: "relative inline-flex items-center mt-0.5", children: [_jsxs("button", { onClick: () => setOpen((v) => !v), className: "flex items-center gap-0.5 text-[10px] text-muted-foreground/40 hover:text-muted-foreground transition-colors", "aria-label": "Token usage details", title: "View token usage", children: [_jsx(Info, { className: "h-3 w-3" }), _jsx("span", { children: usage.inputTokens + usage.outputTokens })] }), open && (_jsxs(_Fragment, { children: [_jsx("div", { className: "fixed inset-0 z-40", onClick: () => setOpen(false) }), _jsxs("div", { className: "absolute bottom-full left-0 z-50 mb-1.5 w-52 rounded-lg border border-border bg-popover p-3 shadow-lg text-[11px]", children: [_jsx("div", { className: "font-medium text-foreground/80 mb-2", children: "Token usage" }), _jsxs("div", { className: "space-y-1 text-muted-foreground", children: [_jsxs("div", { className: "flex justify-between", children: [_jsx("span", { children: "Input" }), _jsx("span", { className: "font-mono text-foreground/70", children: usage.inputTokens.toLocaleString() })] }), _jsxs("div", { className: "flex justify-between", children: [_jsx("span", { children: "Output" }), _jsx("span", { className: "font-mono text-foreground/70", children: usage.outputTokens.toLocaleString() })] }), (usage.cacheReadTokens ?? 0) > 0 && (_jsxs("div", { className: "flex justify-between text-blue-500/70", children: [_jsx("span", { children: "Cache read" }), _jsx("span", { className: "font-mono", children: usage.cacheReadTokens.toLocaleString() })] })), (usage.cacheWriteTokens ?? 0) > 0 && (_jsxs("div", { className: "flex justify-between text-purple-500/70", children: [_jsx("span", { children: "Cache write" }), _jsx("span", { className: "font-mono", children: usage.cacheWriteTokens.toLocaleString() })] })), _jsxs("div", { className: "flex justify-between border-t border-border pt-1 mt-1 text-foreground/60", children: [_jsx("span", { children: "Total" }), _jsx("span", { className: "font-mono", children: (usage.inputTokens + usage.outputTokens).toLocaleString() })] }), cost !== null && (_jsxs("div", { className: "flex justify-between text-emerald-600 dark:text-emerald-400 font-medium", children: [_jsx("span", { children: "Est. cost" }), _jsx("span", { className: "font-mono", children: cost < 0.001 ? "<$0.001" : cost < 0.01 ? `$${cost.toFixed(4)}` : `$${cost.toFixed(3)}` })] }))] }), modelId && (_jsx("div", { className: "mt-2 pt-2 border-t border-border text-[10px] text-muted-foreground/50 font-mono truncate", children: modelId }))] })] }))] }));
}
function getMessageText(message) {
    return message.content
        .filter((b) => b.type === "text")
        .map((b) => (b.type === "text" ? b.text : ""))
        .join("\n");
}
