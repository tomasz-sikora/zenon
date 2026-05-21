import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  Pencil,
  RefreshCw,
  Wrench,
  X,
  Brain,
  Loader2,
  AlertCircle,
  Info,
} from "lucide-react";
import type { Message, ToolResultContent, ToolUseContent } from "@zenon/shared-types";
import { cn } from "@/lib/utils";
import type { AskUserQuestionType } from "@/lib/tools/askUser";
import { ASK_USER_CONFIRM_OPTIONS, isAskUserQuestionType } from "@/lib/tools/askUser";

interface MessageBubbleProps {
  message: Message;
  isStreaming: boolean;
  /** Lookup map of toolCallId → ToolResultContent, built by MessageList from tool-role messages */
  toolResultMap: Map<string, ToolResultContent>;
  onEditMessage: (messageId: string, text: string) => void;
  onRetryMessage: (messageId: string) => void;
  onSubmitToolPromptResponse: (content: string) => void;
}

export function MessageBubble({
  message,
  isStreaming,
  toolResultMap,
  onEditMessage,
  onRetryMessage,
  onSubmitToolPromptResponse,
}: MessageBubbleProps) {
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => getMessageText(message));

  const saveEdit = () => {
    const next = draft.trim();
    if (!next) return;
    onEditMessage(message.id, next);
    setEditing(false);
  };

  return (
    <div
      className={cn(
        "group flex gap-3 animate-fade-in",
        isUser && "flex-row-reverse",
      )}
    >
      {/* Avatar */}
      {!isUser && (
        <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm">
          {isStreaming ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            "Z"
          )}
        </div>
      )}

      {/* Content */}
      <div className={cn("flex max-w-[85%] flex-col gap-1.5", isUser && "items-end")}>
        {editing && isUser ? (
          <div className="w-full min-w-[320px] rounded-2xl rounded-tr-sm bg-primary/10 p-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={Math.min(8, Math.max(2, draft.split("\n").length))}
              className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
            />
            <div className="mt-2 flex justify-end gap-2">
              <button
                onClick={() => { setDraft(getMessageText(message)); setEditing(false); }}
                className="flex items-center gap-1 rounded border border-border px-2 py-1 text-xs hover:bg-muted"
              >
                <X className="h-3 w-3" />
                Cancel
              </button>
              <button
                onClick={saveEdit}
                className="flex items-center gap-1 rounded bg-primary px-2 py-1 text-xs text-primary-foreground hover:bg-primary/90"
              >
                <Check className="h-3 w-3" />
                Save & retry
              </button>
            </div>
          </div>
        ) : (
          message.content.map((block, i) => (
            <ContentBlock
              key={i}
              block={block}
              isUser={isUser}
              isStreaming={isStreaming && i === message.content.length - 1}
              toolResultMap={toolResultMap}
              onSubmitToolPromptResponse={onSubmitToolPromptResponse}
            />
          ))
        )}

        {/* Per-message token usage — info icon with popover */}
        {message.usage && !isStreaming && (
          <TokenUsageInfo usage={message.usage} modelId={message.modelId} />
        )}

        {/* Action buttons */}
        {!editing && !isStreaming && (
          <div className={cn("flex gap-1 opacity-0 transition-opacity group-hover:opacity-100", isUser && "justify-end")}>
            {isUser && (
              <button
                onClick={() => { setDraft(getMessageText(message)); setEditing(true); }}
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Pencil className="h-3 w-3" />
                Edit
              </button>
            )}
            {isAssistant && (
              <button
                onClick={() => onRetryMessage(message.id)}
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <RefreshCw className="h-3 w-3" />
                Retry
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Individual content block renderers ───────────────────────────────────────

function ContentBlock({
  block,
  isUser,
  isStreaming,
  toolResultMap,
  onSubmitToolPromptResponse,
}: {
  block: Message["content"][number];
  isUser: boolean;
  isStreaming: boolean;
  toolResultMap: Map<string, ToolResultContent>;
  onSubmitToolPromptResponse: (content: string) => void;
}) {
  const [copied, setCopied] = useState(false);

  if (block.type === "thinking") {
    return <ThinkingBlock thinking={block.thinking} isStreaming={isStreaming} />;
  }

  if (block.type === "text") {
    // Show animated typing dots while waiting for the first token
    if (!block.text && isStreaming) {
      return (
        <div className="rounded-2xl rounded-tl-sm bg-muted/60 px-4 py-3">
          <TypingDots />
        </div>
      );
    }

    return (
      <div
        className={cn(
          "relative rounded-2xl px-4 py-2.5 text-sm",
          isUser
            ? "bg-primary text-primary-foreground rounded-tr-sm"
            : "bg-muted/60 rounded-tl-sm",
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{block.text}</p>
        ) : (
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{block.text}</ReactMarkdown>
            {isStreaming && (
              <span className="inline-block h-4 w-0.5 bg-current animate-pulse ml-0.5 align-middle" />
            )}
          </div>
        )}
        {block.text && !isStreaming && (
          <button
            onClick={async () => {
              await navigator.clipboard.writeText(block.text);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-opacity"
            aria-label="Copy"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>
    );
  }

  if (block.type === "tool_use") {
    const result = toolResultMap.get(block.toolCallId);
    return (
      <ToolCallCard
        call={block}
        result={result}
        isStreaming={isStreaming}
        onSubmitToolPromptResponse={onSubmitToolPromptResponse}
      />
    );
  }

  if (block.type === "image") {
    return (
      <img
        src={block.url}
        alt="attachment"
        className="max-w-sm rounded-lg border border-border"
      />
    );
  }

  // tool_result is rendered inside ToolCallCard — never directly
  return null;
}

// ─── Typing dots (waiting for first token) ───────────────────────────────────

function TypingDots() {
  return (
    <div className="flex items-center gap-1" aria-label="Typing…">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-2 w-2 rounded-full bg-muted-foreground/50 animate-bounce"
          style={{ animationDelay: `${i * 150}ms`, animationDuration: "0.9s" }}
        />
      ))}
    </div>
  );
}

// ─── Thinking block ───────────────────────────────────────────────────────────

function ThinkingBlock({ thinking, isStreaming }: { thinking: string; isStreaming: boolean }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl border border-amber-200/50 bg-amber-50/30 dark:border-amber-800/30 dark:bg-amber-950/20 text-xs overflow-hidden w-full">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-amber-100/30 dark:hover:bg-amber-900/20 transition-colors"
      >
        <Brain className={cn("h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0", isStreaming && "animate-pulse")} />
        <span className="font-medium text-amber-700 dark:text-amber-400">
          {isStreaming ? "Reasoning…" : "Reasoning"}
        </span>
        <span className="ml-auto text-amber-500/60">
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </span>
      </button>
      {expanded && (
        <div className="border-t border-amber-200/40 dark:border-amber-800/30 bg-amber-50/20 dark:bg-amber-950/10 px-3 py-2">
          <pre className="whitespace-pre-wrap text-[11px] leading-relaxed text-amber-900/70 dark:text-amber-200/60 font-mono">
            {thinking}
            {isStreaming && (
              <span className="inline-block h-3 w-0.5 bg-amber-500 animate-pulse ml-0.5 align-middle" />
            )}
          </pre>
        </div>
      )}
    </div>
  );
}

// ─── Tool call + result card ──────────────────────────────────────────────────

function ToolCallCard({
  call,
  result,
  isStreaming,
  onSubmitToolPromptResponse,
}: {
  call: ToolUseContent;
  result?: ToolResultContent;
  isStreaming: boolean;
  onSubmitToolPromptResponse: (content: string) => void;
}) {
  const humanPrompt = getHumanPrompt(call, result);
  const [expanded, setExpanded] = useState(call.toolName === "ask_user");
  const isPending = !result && isStreaming;
  const hasError = result?.isError;

  return (
    <div
      className={cn(
        "rounded-xl border text-xs overflow-hidden w-full",
        hasError
          ? "border-destructive/40 bg-destructive/5"
          : "border-border bg-muted/25",
      )}
    >
      {/* Header row */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/40 transition-colors"
      >
        {isPending ? (
          <Loader2 className="h-3.5 w-3.5 text-primary animate-spin shrink-0" />
        ) : hasError ? (
          <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
        ) : (
          <Wrench className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        )}
        <span className="font-mono font-medium">{call.toolName}</span>
        {isPending && (
          <span className="text-muted-foreground italic">running…</span>
        )}
        {hasError && (
          <span className="text-destructive font-medium">error</span>
        )}
        {result && !hasError && (
          <span className="text-green-600 dark:text-green-400 text-[10px]">✓</span>
        )}
        <span className="ml-auto text-muted-foreground/60">
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </span>
      </button>

      {/* Expanded: input + result */}
      {expanded && (
        <div className="border-t border-border divide-y divide-border/60">
          {/* Input */}
          <div className="px-3 py-2 bg-background/40">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 font-medium">Input</div>
            <pre className="overflow-x-auto text-[11px] leading-relaxed">
              {JSON.stringify(call.toolInput, null, 2)}
            </pre>
          </div>

          {/* Output */}
          {result ? (
            <div className={cn("px-3 py-2", hasError ? "bg-destructive/5" : "bg-background/30")}>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 font-medium">
                {hasError ? "Error" : "Output"}
              </div>
              {humanPrompt && !hasError ? (
                <HumanPromptResponse
                  prompt={humanPrompt}
                  onSubmitToolPromptResponse={onSubmitToolPromptResponse}
                  disabled={isStreaming}
                />
              ) : (
                <ToolResultBody content={result.content} />
              )}
            </div>
          ) : (
            <div className="px-3 py-2 flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Waiting for result…</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type HumanPrompt = {
  question: string;
  questionType: AskUserQuestionType;
  options: string[];
  placeholder?: string;
  minSelections?: number;
  maxSelections?: number;
};

function getHumanPrompt(call: ToolUseContent, result?: ToolResultContent): HumanPrompt | null {
  if (call.toolName !== "ask_user") return null;
  const payload = parseHumanPromptPayload(result?.content) ?? call.toolInput;
  if (!payload || typeof payload !== "object") return null;
  const question = typeof payload.question === "string" ? payload.question.trim() : "";
  if (!question) return null;
  const questionType = isAskUserQuestionType(payload.questionType)
    ? payload.questionType
    : "open";
  const options = Array.isArray(payload.options)
    ? payload.options.filter((opt): opt is string => typeof opt === "string").map((opt) => opt.trim()).filter(Boolean)
    : [];
  const placeholder = typeof payload.placeholder === "string" ? payload.placeholder : undefined;
  const minSelections = Number.isFinite(Number(payload.minSelections))
    ? Math.max(1, Math.floor(Number(payload.minSelections)))
    : undefined;
  const maxSelections = Number.isFinite(Number(payload.maxSelections))
    ? Math.max(minSelections ?? 1, Math.floor(Number(payload.maxSelections)))
    : undefined;
  return { question, questionType, options, placeholder, minSelections, maxSelections };
}

function parseHumanPromptPayload(content?: string): Record<string, unknown> | null {
  if (!content) return null;
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    if (parsed.type === "human_input_request" || typeof parsed.question === "string") {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function HumanPromptResponse({
  prompt,
  onSubmitToolPromptResponse,
  disabled,
}: {
  prompt: HumanPrompt;
  onSubmitToolPromptResponse: (content: string) => void;
  disabled: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const options = prompt.questionType === "confirm" && prompt.options.length === 0
    ? [...ASK_USER_CONFIRM_OPTIONS]
    : prompt.options;

  const send = (answer: string | string[]) => {
    const formatted = Array.isArray(answer) ? answer.join(", ") : answer;
    if (!formatted.trim()) return;
    onSubmitToolPromptResponse(
      JSON.stringify({
        type: "ask_user_response",
        question: prompt.question,
        answer: formatted,
      }),
    );
  };

  if (prompt.questionType === "open") {
    return (
      <div className="space-y-2">
        <p className="text-[11px] text-muted-foreground">{prompt.question}</p>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={prompt.placeholder ?? "Type your answer…"}
          className="w-full resize-y rounded-md border border-border bg-background px-2 py-1.5 text-[11px] outline-none focus:ring-1 focus:ring-ring"
          rows={3}
        />
        <button
          onClick={() => send(draft)}
          disabled={disabled || !draft.trim()}
          className="rounded border border-border bg-background px-2 py-1 text-[11px] font-medium hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          Send answer
        </button>
      </div>
    );
  }

  if (prompt.questionType === "multiple_choice") {
    const minSelections = prompt.minSelections ?? 1;
    const maxSelections = prompt.maxSelections ?? Math.max(minSelections, options.length || 1);
    return (
      <div className="space-y-2">
        <p className="text-[11px] text-muted-foreground">{prompt.question}</p>
        <div className="space-y-1">
          {options.map((option) => {
            const checked = selected.includes(option);
            return (
              <label key={option} className="flex items-center gap-2 text-[11px]">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled}
                  onChange={(e) => {
                    if (!e.target.checked) {
                      setSelected((prev) => prev.filter((item) => item !== option));
                      return;
                    }
                    setSelected((prev) => {
                      if (prev.includes(option)) return prev;
                      if (prev.length >= maxSelections) return prev;
                      return [...prev, option];
                    });
                  }}
                />
                <span>{option}</span>
              </label>
            );
          })}
        </div>
        <button
          onClick={() => send(selected)}
          disabled={disabled || selected.length < minSelections}
          className="rounded border border-border bg-background px-2 py-1 text-[11px] font-medium hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          Submit selections
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-muted-foreground">{prompt.question}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => (
          <button
            key={option}
            onClick={() => send(option)}
            disabled={disabled}
            className="rounded border border-border bg-background px-2 py-1 text-[11px] hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Tool result body (text / stdout+stderr / images) ─────────────────────────

function ToolResultBody({ content }: { content: string }) {
  const parsed = parseToolResultContent(content);

  if (parsed) {
    return (
      <div className="space-y-1.5">
        {parsed.stdout && (
          <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-muted/60 px-2 py-1.5 text-[11px] max-h-64">
            {parsed.stdout}
          </pre>
        )}
        {parsed.stderr && (
          <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive max-h-32">
            {parsed.stderr}
          </pre>
        )}
        {parsed.figures.map((fig, idx) => (
          <img
            key={idx}
            src={fig}
            alt={`figure ${idx + 1}`}
            className="max-w-full rounded-md border border-border bg-white"
          />
        ))}
      </div>
    );
  }

  return (
    <pre className="overflow-x-auto whitespace-pre-wrap text-[11px] leading-relaxed max-h-64">
      {content}
    </pre>
  );
}

function parseToolResultContent(content: string):
  | { stdout?: string; stderr?: string; figures: string[] }
  | null {
  try {
    const parsed = JSON.parse(content) as { stdout?: unknown; stderr?: unknown; figures?: unknown };
    const figures = Array.isArray(parsed.figures)
      ? parsed.figures.filter((f): f is string => typeof f === "string")
      : [];
    const stdout = typeof parsed.stdout === "string" ? parsed.stdout : undefined;
    const stderr = typeof parsed.stderr === "string" ? parsed.stderr : undefined;
    if (!stdout && !stderr && figures.length === 0) return null;
    return { stdout, stderr, figures };
  } catch {
    return null;
  }
}

// ─── Token Usage Info ─────────────────────────────────────────────────────────

const MODEL_PRICING: Record<string, { input: number; output: number; cacheRead?: number }> = {
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

function estimateMessageCost(
  modelId: string | undefined,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens = 0,
): number | null {
  if (!modelId) return null;
  const pricing = MODEL_PRICING[modelId];
  if (!pricing) return null;
  return (
    (inputTokens * pricing.input) / 1_000_000 +
    (outputTokens * pricing.output) / 1_000_000 +
    (cacheReadTokens > 0 && pricing.cacheRead ? (cacheReadTokens * pricing.cacheRead) / 1_000_000 : 0)
  );
}

function TokenUsageInfo({
  usage,
  modelId,
}: {
  usage: NonNullable<Message["usage"]>;
  modelId?: string;
}) {
  const [open, setOpen] = useState(false);
  const cost = estimateMessageCost(modelId, usage.inputTokens, usage.outputTokens, usage.cacheReadTokens);

  return (
    <div className="relative inline-flex items-center mt-0.5">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-0.5 text-[10px] text-muted-foreground/40 hover:text-muted-foreground transition-colors"
        aria-label="Token usage details"
        title="View token usage"
      >
        <Info className="h-3 w-3" />
        <span>{usage.inputTokens + usage.outputTokens}</span>
      </button>

      {open && (
        <>
          {/* backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full left-0 z-50 mb-1.5 w-52 rounded-lg border border-border bg-popover p-3 shadow-lg text-[11px]">
            <div className="font-medium text-foreground/80 mb-2">Token usage</div>
            <div className="space-y-1 text-muted-foreground">
              <div className="flex justify-between">
                <span>Input</span>
                <span className="font-mono text-foreground/70">{usage.inputTokens.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Output</span>
                <span className="font-mono text-foreground/70">{usage.outputTokens.toLocaleString()}</span>
              </div>
              {(usage.cacheReadTokens ?? 0) > 0 && (
                <div className="flex justify-between text-blue-500/70">
                  <span>Cache read</span>
                  <span className="font-mono">{usage.cacheReadTokens!.toLocaleString()}</span>
                </div>
              )}
              {(usage.cacheWriteTokens ?? 0) > 0 && (
                <div className="flex justify-between text-purple-500/70">
                  <span>Cache write</span>
                  <span className="font-mono">{usage.cacheWriteTokens!.toLocaleString()}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-border pt-1 mt-1 text-foreground/60">
                <span>Total</span>
                <span className="font-mono">{(usage.inputTokens + usage.outputTokens).toLocaleString()}</span>
              </div>
              {cost !== null && (
                <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-medium">
                  <span>Est. cost</span>
                  <span className="font-mono">
                    {cost < 0.001 ? "<$0.001" : cost < 0.01 ? `$${cost.toFixed(4)}` : `$${cost.toFixed(3)}`}
                  </span>
                </div>
              )}
            </div>
            {modelId && (
              <div className="mt-2 pt-2 border-t border-border text-[10px] text-muted-foreground/50 font-mono truncate">
                {modelId}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function getMessageText(message: Message): string {
  return message.content
    .filter((b) => b.type === "text")
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("\n");
}
