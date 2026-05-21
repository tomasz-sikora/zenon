import type { Message } from "@zenon/shared-types";
interface MessageListProps {
    messages: Message[];
    streamingMsgId: string | null;
    isStreaming: boolean;
    onEditMessage: (messageId: string, text: string) => void;
    onRetryMessage: (messageId: string) => void;
}
export declare function MessageList({ messages, streamingMsgId, isStreaming, onEditMessage, onRetryMessage, }: MessageListProps): import("react/jsx-runtime").JSX.Element;
export {};
