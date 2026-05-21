import type { Conversation, Message, ModelRef } from "@zenon/shared-types";
interface ConversationStore {
    conversations: Conversation[];
    activeConversationId: string | null;
    createConversation: (opts: {
        workspaceId: string;
        agentId?: string;
        model?: ModelRef;
        title?: string;
    }) => string;
    deleteConversation: (id: string) => void;
    renameConversation: (id: string, title: string) => void;
    setActiveConversation: (id: string | null) => void;
    setConversationAgent: (id: string, agentId: string) => void;
    addMessage: (conversationId: string, message: Omit<Message, "id" | "createdAt">) => string;
    updateMessage: (conversationId: string, messageId: string, patch: Partial<Message>) => void;
    appendToMessage: (conversationId: string, messageId: string, text: string) => void;
    deleteMessage: (conversationId: string, messageId: string) => void;
    truncateAfterMessage: (conversationId: string, messageId: string) => void;
    getConversation: (id: string) => Conversation | undefined;
}
export declare const useConversationStore: import("zustand").UseBoundStore<Omit<import("zustand").StoreApi<ConversationStore>, "setState" | "persist"> & {
    setState(partial: ConversationStore | Partial<ConversationStore> | ((state: ConversationStore) => ConversationStore | Partial<ConversationStore>), replace?: false | undefined): unknown;
    setState(state: ConversationStore | ((state: ConversationStore) => ConversationStore), replace: true): unknown;
    persist: {
        setOptions: (options: Partial<import("zustand/middleware").PersistOptions<ConversationStore, {
            conversations: Conversation[];
            activeConversationId: string | null;
            createConversation: (opts: {
                workspaceId: string;
                agentId?: string;
                model?: ModelRef;
                title?: string;
            }) => string;
            deleteConversation: (id: string) => void;
            renameConversation: (id: string, title: string) => void;
            setActiveConversation: (id: string | null) => void;
            setConversationAgent: (id: string, agentId: string) => void;
            addMessage: (conversationId: string, message: Omit<Message, "id" | "createdAt">) => string;
            updateMessage: (conversationId: string, messageId: string, patch: Partial<Message>) => void;
            appendToMessage: (conversationId: string, messageId: string, text: string) => void;
            deleteMessage: (conversationId: string, messageId: string) => void;
            truncateAfterMessage: (conversationId: string, messageId: string) => void;
            getConversation: (id: string) => Conversation | undefined;
        }, unknown>>) => void;
        clearStorage: () => void;
        rehydrate: () => Promise<void> | void;
        hasHydrated: () => boolean;
        onHydrate: (fn: (state: ConversationStore) => void) => () => void;
        onFinishHydration: (fn: (state: ConversationStore) => void) => () => void;
        getOptions: () => Partial<import("zustand/middleware").PersistOptions<ConversationStore, {
            conversations: Conversation[];
            activeConversationId: string | null;
            createConversation: (opts: {
                workspaceId: string;
                agentId?: string;
                model?: ModelRef;
                title?: string;
            }) => string;
            deleteConversation: (id: string) => void;
            renameConversation: (id: string, title: string) => void;
            setActiveConversation: (id: string | null) => void;
            setConversationAgent: (id: string, agentId: string) => void;
            addMessage: (conversationId: string, message: Omit<Message, "id" | "createdAt">) => string;
            updateMessage: (conversationId: string, messageId: string, patch: Partial<Message>) => void;
            appendToMessage: (conversationId: string, messageId: string, text: string) => void;
            deleteMessage: (conversationId: string, messageId: string) => void;
            truncateAfterMessage: (conversationId: string, messageId: string) => void;
            getConversation: (id: string) => Conversation | undefined;
        }, unknown>>;
    };
}>;
export {};
