import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useRef } from "react";
import { MessageBubble } from "./MessageBubble";
import { Bot } from "lucide-react";
export function MessageList({ messages, streamingMsgId, isStreaming, onEditMessage, onRetryMessage, }) {
    const bottomRef = useRef(null);
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, isStreaming]);
    // Build a lookup of toolCallId → ToolResultContent from all tool messages
    // so tool_use blocks can display their result inline
    const toolResultMap = useMemo(() => {
        const map = new Map();
        for (const msg of messages) {
            if (msg.role === "tool") {
                for (const block of msg.content) {
                    if (block.type === "tool_result") {
                        map.set(block.toolCallId, block);
                    }
                }
            }
        }
        return map;
    }, [messages]);
    if (messages.length === 0) {
        return (_jsxs("div", { className: "flex flex-1 flex-col items-center justify-center gap-4 text-center px-4", children: [_jsx("div", { className: "flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10", children: _jsx(Bot, { className: "h-7 w-7 text-primary" }) }), _jsxs("div", { children: [_jsx("h2", { className: "text-xl font-semibold", children: "How can I help?" }), _jsx("p", { className: "mt-1 text-sm text-muted-foreground", children: "Start a conversation or choose an agent to get started." })] })] }));
    }
    return (_jsx("div", { className: "flex-1 overflow-y-auto", children: _jsxs("div", { className: "mx-auto max-w-3xl px-4 py-6 space-y-2", children: [messages
                    .filter((m) => m.role !== "system" && m.role !== "tool")
                    .map((msg) => (_jsx(MessageBubble, { message: msg, toolResultMap: toolResultMap, isStreaming: streamingMsgId === msg.id && isStreaming, onEditMessage: onEditMessage, onRetryMessage: onRetryMessage }, msg.id))), _jsx("div", { ref: bottomRef })] }) }));
}
