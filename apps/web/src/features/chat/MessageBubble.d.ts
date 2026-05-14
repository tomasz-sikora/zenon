import type { Message, ToolResultContent } from "@zenon/shared-types";
interface MessageBubbleProps {
    message: Message;
    isStreaming: boolean;
    /** Lookup map of toolCallId → ToolResultContent, built by MessageList from tool-role messages */
    toolResultMap: Map<string, ToolResultContent>;
    onEditMessage: (messageId: string, text: string) => void;
    onRetryMessage: (messageId: string) => void;
}
export declare function MessageBubble({ message, isStreaming, toolResultMap, onEditMessage, onRetryMessage, }: MessageBubbleProps): import("react/jsx-runtime").JSX.Element;
export {};
