import { create } from "zustand";
import { persist } from "zustand/middleware";
import { generateId } from "@/lib/utils";
const DEFAULT_MODEL = {
    providerId: "openai",
    modelId: "gpt-4o",
};
export const useConversationStore = create()(persist((set, get) => ({
    conversations: [],
    activeConversationId: null,
    createConversation: ({ workspaceId, agentId, model, title }) => {
        const id = generateId();
        const now = Date.now();
        const conversation = {
            id,
            workspaceId,
            title: title ?? "",
            agentId,
            model: model ?? DEFAULT_MODEL,
            messages: [],
            createdAt: now,
            updatedAt: now,
        };
        set((s) => ({
            conversations: [conversation, ...s.conversations],
            activeConversationId: id,
        }));
        return id;
    },
    deleteConversation: (id) => {
        set((s) => ({
            conversations: s.conversations.filter((c) => c.id !== id),
            activeConversationId: s.activeConversationId === id ? null : s.activeConversationId,
        }));
    },
    renameConversation: (id, title) => {
        set((s) => ({
            conversations: s.conversations.map((c) => c.id === id ? { ...c, title, updatedAt: Date.now() } : c),
        }));
    },
    setConversationAgent: (id, agentId) => {
        set((s) => ({
            conversations: s.conversations.map((c) => c.id === id ? { ...c, agentId, updatedAt: Date.now() } : c),
        }));
    },
    setActiveConversation: (id) => {
        set({ activeConversationId: id });
    },
    addMessage: (conversationId, message) => {
        const id = generateId();
        const msg = {
            ...message,
            id,
            createdAt: Date.now(),
        };
        set((s) => ({
            conversations: s.conversations.map((c) => {
                if (c.id !== conversationId)
                    return c;
                // Auto-title from first user message
                const isFirstUserMsg = message.role === "user" && c.messages.length === 0;
                const title = isFirstUserMsg
                    ? extractTitle(message.content)
                    : c.title;
                return {
                    ...c,
                    title,
                    messages: [...c.messages, msg],
                    updatedAt: Date.now(),
                };
            }),
        }));
        return id;
    },
    updateMessage: (conversationId, messageId, patch) => {
        set((s) => ({
            conversations: s.conversations.map((c) => c.id !== conversationId
                ? c
                : {
                    ...c,
                    messages: c.messages.map((m) => m.id === messageId ? { ...m, ...patch } : m),
                    updatedAt: Date.now(),
                }),
        }));
    },
    appendToMessage: (conversationId, messageId, text) => {
        set((s) => ({
            conversations: s.conversations.map((c) => {
                if (c.id !== conversationId)
                    return c;
                return {
                    ...c,
                    messages: c.messages.map((m) => {
                        if (m.id !== messageId)
                            return m;
                        const content = m.content.map((block, i) => i === m.content.length - 1 && block.type === "text"
                            ? { ...block, text: block.text + text }
                            : block);
                        // If no text block yet, add one
                        if (content.every((b) => b.type !== "text")) {
                            content.push({ type: "text", text });
                        }
                        return { ...m, content };
                    }),
                };
            }),
        }));
    },
    deleteMessage: (conversationId, messageId) => {
        set((s) => ({
            conversations: s.conversations.map((c) => c.id !== conversationId
                ? c
                : {
                    ...c,
                    messages: c.messages.filter((m) => m.id !== messageId),
                    updatedAt: Date.now(),
                }),
        }));
    },
    truncateAfterMessage: (conversationId, messageId) => {
        set((s) => ({
            conversations: s.conversations.map((c) => {
                if (c.id !== conversationId)
                    return c;
                const idx = c.messages.findIndex((m) => m.id === messageId);
                if (idx < 0)
                    return c;
                return {
                    ...c,
                    messages: c.messages.slice(0, idx + 1),
                    updatedAt: Date.now(),
                };
            }),
        }));
    },
    getConversation: (id) => get().conversations.find((c) => c.id === id),
}), {
    name: "zenon-conversations",
    // Only persist recent 100 conversations to avoid storage bloat
    partialize: (s) => ({
        ...s,
        conversations: s.conversations.slice(0, 100),
    }),
}));
function extractTitle(content) {
    for (const block of content) {
        if (block.type === "text") {
            return block.text.slice(0, 60).trim() || "New Chat";
        }
    }
    return "New Chat";
}
