interface ChatInputProps {
    onSend: (content: string, attachments?: File[]) => void;
    onStop: () => void;
    isStreaming: boolean;
    disabled: boolean;
}
export declare function ChatInput({ onSend, onStop, isStreaming, disabled }: ChatInputProps): import("react/jsx-runtime").JSX.Element;
export {};
