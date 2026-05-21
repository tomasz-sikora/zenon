import { useEffect, useMemo, useRef } from "react";
import type { Message, ToolResultContent } from "@zenon/shared-types";
import { MessageBubble } from "./MessageBubble";
import { Bot } from "lucide-react";

interface MessageListProps {
  messages: Message[];
  streamingMsgId: string | null;
  isStreaming: boolean;
  onEditMessage: (messageId: string, text: string) => void;
  onRetryMessage: (messageId: string) => void;
  onSubmitToolPromptResponse: (content: string) => void;
}

export function MessageList({
  messages,
  streamingMsgId,
  isStreaming,
  onEditMessage,
  onRetryMessage,
  onSubmitToolPromptResponse,
}: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  // Build a lookup of toolCallId → ToolResultContent from all tool messages
  // so tool_use blocks can display their result inline
  const toolResultMap = useMemo(() => {
    const map = new Map<string, ToolResultContent>();
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
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center px-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
          <Bot className="h-7 w-7 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-semibold">How can I help?</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Start a conversation or choose an agent to get started.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-6 space-y-2">
        {messages
          .filter((m) => m.role !== "system" && m.role !== "tool")
          .map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              toolResultMap={toolResultMap}
              isStreaming={streamingMsgId === msg.id && isStreaming}
              onEditMessage={onEditMessage}
              onRetryMessage={onRetryMessage}
              onSubmitToolPromptResponse={onSubmitToolPromptResponse}
            />
          ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
