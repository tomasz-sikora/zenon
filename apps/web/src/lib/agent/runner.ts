import type {
  Message,
  AgentDefinition,
  ToolCall,
  ToolResult,
  MessageContent,
} from "@zenon/shared-types";
import type { StreamCallback } from "@/lib/providers/base";
import { createProvider, getProxyBaseUrl } from "@/lib/providers";
import { useProviderStore } from "@/store/providerStore";
import { useSkillStore } from "@/store/skillStore";
import { useWorkspaceStore } from "@/store/workspaceStore";
import { workspacePaths } from "@/lib/storage/workspace";
import { toolRegistry } from "@/lib/tools/registry";
import { generateId } from "@/lib/utils";

export interface AgentRunOptions {
  conversation: { id: string; messages: Message[] };
  agent: AgentDefinition;
  /** Override which global skills to inject (by id). If omitted, all enabled skills are used. */
  selectedSkillIds?: string[];
  onChunk: (text: string) => void;
  /** Called when the model emits extended reasoning/thinking text */
  onThinking?: (text: string) => void;
  onToolCall: (toolCall: ToolCall) => void;
  onToolResult: (result: ToolResult) => void;
  onComplete: (usage?: { inputTokens: number; outputTokens: number; cacheReadTokens?: number; cacheWriteTokens?: number }) => void;
  onError: (error: Error) => void;
  /** Called when a transient error triggers a retry */
  onRetry?: (attempt: number, maxAttempts: number, error: Error) => void;
  signal?: AbortSignal;
}

const MAX_TOOL_ROUNDS = 12;
const MAX_RETRIES = 3;

/**
 * Remove any assistant tool-call messages that are not followed by matching
 * tool-result messages. This fixes malformed history left by aborted/errored
 * runs and prevents the OpenAI "tool_call_ids did not have response messages"
 * 400 error.
 */
function sanitizeMessages(msgs: Message[]): Message[] {
  const clean: Message[] = [];
  let i = 0;
  while (i < msgs.length) {
    const msg = msgs[i];
    if (msg.role === "assistant") {
      const toolUseItems = msg.content.filter((c) => c.type === "tool_use");
      if (toolUseItems.length > 0) {
        const expectedIds = new Set(
          toolUseItems.map((c) => c.toolCallId).filter((id): id is string => !!id),
        );
        // Collect ALL immediately-following tool messages (each tool result is stored separately)
        let j = i + 1;
        const coveredIds = new Set<string>();
        while (j < msgs.length && msgs[j].role === "tool") {
          for (const c of msgs[j].content) {
            if (c.type === "tool_result" && c.toolCallId) coveredIds.add(c.toolCallId);
          }
          j++;
        }
        if (![...expectedIds].every((id) => coveredIds.has(id))) {
          // Incomplete results — drop assistant message + all collected tool messages
          i = j;
          continue;
        }
        // All covered — keep assistant + all its tool messages
        clean.push(msg);
        for (let k = i + 1; k < j; k++) clean.push(msgs[k]);
        i = j;
        continue;
      }
    } else if (msg.role === "tool") {
      const prev = clean[clean.length - 1];
      if (!prev || prev.role !== "assistant" || !prev.content.some((c) => c.type === "tool_use")) {
        // Orphaned tool-result with no preceding tool-call — drop it
        i++;
        continue;
      }
    }
    clean.push(msg);
    i++;
  }
  return clean;
}
const RETRY_DELAYS_MS = [1500, 3000, 6000];

function isRetryableError(err: Error): boolean {
  const msg = err.message.toLowerCase();
  return (
    msg.includes("rate limit") ||
    msg.includes("429") ||
    msg.includes("503") ||
    msg.includes("502") ||
    msg.includes("overloaded") ||
    msg.includes("timeout") ||
    msg.includes("network") ||
    msg.includes("econnreset") ||
    msg.includes("socket")
  );
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Main agent run loop (ReAct pattern):
 * 1. Send messages + tools to LLM
 * 2. Stream response; collect tool calls + thinking
 * 3. Execute tool calls in parallel
 * 4. Add results to messages; loop back to step 1
 * 5. When no tool calls, or on last round (tools stripped to force text), done
 */
export async function runAgent(opts: AgentRunOptions): Promise<void> {
  const {
    conversation,
    agent,
    selectedSkillIds,
    onChunk,
    onThinking,
    onToolCall,
    onToolResult,
    onComplete,
    onError,
    onRetry,
    signal,
  } = opts;

  const providerStore = useProviderStore.getState();
  const providerConfig = providerStore.providers.find(
    (p) => p.id === agent.model.providerId,
  );

  if (!providerConfig) {
    onError(new Error(`Provider "${agent.model.providerId}" not configured`));
    return;
  }

  const apiKey = providerStore.getApiKey(agent.model.providerId) ?? "";
  const requiresApiKey =
    providerConfig.type !== "openai-compatible" &&
    providerConfig.type !== "local-webgpu" &&
    providerConfig.type !== "local-wasm";
  if (!apiKey && requiresApiKey) {
    onError(new Error(`No API key for provider "${providerConfig.name}". Please add it in Settings.`));
    return;
  }

  let provider;
  try {
    provider = createProvider(providerConfig, apiKey, getProxyBaseUrl());
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)));
    return;
  }

  const tools = toolRegistry.getDefinitionsByNames(agent.tools);

  const allSkills = useSkillStore.getState().skills;
  const globalSkills = selectedSkillIds !== undefined
    ? allSkills.filter((sk) => selectedSkillIds.includes(sk.id))
    : allSkills.filter((sk) => sk.enabled);
  const agentSkillFiles = agent.skillFiles ?? [];

  const workspaceStore = useWorkspaceStore.getState();
  const workspaceId = workspaceStore.currentWorkspaceId ?? "default";
  const workspaceMeta = workspaceStore.workspaces.find((w) => w.id === workspaceId);
  const workspaceFilesPath = workspacePaths.files(workspaceId);
  const workspaceArtifactsPath = workspacePaths.artifacts(workspaceId);

  const workspaceContext = [
    `## Workspace`,
    `Current workspace: "${workspaceMeta?.name ?? workspaceId}" (id: ${workspaceId})`,
    `Files directory: ${workspaceFilesPath}`,
    `Artifacts directory: ${workspaceArtifactsPath}`,
    `IMPORTANT: When using file tools (read_file, write_file, list_files, delete_file), always use the FULL path starting with "${workspaceFilesPath}".`,
    `Example: to write "result.txt" use path "${workspaceFilesPath}/result.txt"`,
    `Example: to list workspace files use path "${workspaceFilesPath}"`,
  ].join("\n");

  const systemParts: string[] = [];
  systemParts.push(workspaceContext);
  for (const skill of globalSkills) {
    systemParts.push(`# ${skill.name}\n\n${skill.content}`);
  }
  for (const sf of agentSkillFiles) {
    systemParts.push(`# ${sf.name}\n\n${sf.content}`);
  }
  if (agent.instructions) {
    systemParts.push(agent.instructions);
  }
  const systemText = systemParts.join("\n\n---\n\n");

  const messages: Message[] = [
    ...(systemText
      ? [
          {
            id: generateId(),
            role: "system" as const,
            content: [{ type: "text" as const, text: systemText }],
            createdAt: 0,
          },
        ]
      : []),
    ...sanitizeMessages(conversation.messages),
  ];

  let round = 0;
  // Track tool call signatures for infinite loop detection: sig → times seen
  const toolCallHistory = new Map<string, number>();
  // Set to true once any tool round completes; used to decide whether to force a summary.
  let hadToolsExecution = false;
  // Prevents injecting more than one forced-summary round.
  let summaryForced = false;
  // When true, the next round runs without tools (forces a text-only / summary response).
  let forceNextRoundNoTools = false;

  while (round < MAX_TOOL_ROUNDS) {
    round++;

    // On the final allowed round (or after a forced-summary injection), strip tools
    // so the model must produce a text-only response.
    const isLastRound = round === MAX_TOOL_ROUNDS;
    const roundTools = (isLastRound || forceNextRoundNoTools) ? [] : tools;
    forceNextRoundNoTools = false;

    let roundHasText = false;

    const pendingToolCalls: Array<{
      id: string;
      name: string;
      input: Record<string, unknown>;
    }> = [];

    let totalUsage: { inputTokens: number; outputTokens: number; cacheReadTokens?: number; cacheWriteTokens?: number } | undefined;

    // Stream the LLM response — with retry on transient errors
    let attempt = 0;
    while (true) {
      try {
        await new Promise<void>((resolve, reject) => {
          provider
            .complete(
              {
                messages,
                modelId: agent.model.modelId,
                ...(roundTools.length > 0 ? { tools: roundTools } : {}),
                ...(signal ? { signal } : {}),
              },
              (chunk) => {
                if (chunk.type === "text" && chunk.text) {
                  roundHasText = true;
                  onChunk(chunk.text);
                } else if (chunk.type === "thinking" && chunk.thinkingText) {
                  onThinking?.(chunk.thinkingText);
                } else if (
                  chunk.type === "tool_call_end" &&
                  chunk.toolCallId &&
                  chunk.toolName &&
                  chunk.toolInput
                ) {
                  const toolCall = {
                    id: chunk.toolCallId,
                    name: chunk.toolName,
                    input: chunk.toolInput,
                  };
                  pendingToolCalls.push(toolCall);
                  onToolCall({
                    id: toolCall.id,
                    toolName: toolCall.name,
                    input: toolCall.input,
                  });
                } else if (chunk.type === "done") {
                  totalUsage = chunk.usage ? {
                    inputTokens: chunk.usage.inputTokens,
                    outputTokens: chunk.usage.outputTokens,
                    cacheReadTokens: chunk.usage.cacheReadTokens,
                    cacheWriteTokens: chunk.usage.cacheWriteTokens,
                  } : undefined;
                }
              },
            )
            .then(resolve)
            .catch(reject);
        });
        break; // success — exit retry loop
      } catch (err) {
        if (signal?.aborted) {
          onError(err instanceof Error ? err : new Error(String(err)));
          return;
        }
        const error = err instanceof Error ? err : new Error(String(err));
        if (attempt < MAX_RETRIES && isRetryableError(error)) {
          attempt++;
          const delay = RETRY_DELAYS_MS[attempt - 1] ?? 6000;
          onRetry?.(attempt, MAX_RETRIES, error);
          await sleep(delay);
          // Clear any tool calls already collected in this failed round
          pendingToolCalls.length = 0;
          continue;
        }
        onError(error);
        return;
      }
    }

    if (pendingToolCalls.length === 0) {
      // If the model gave no text and tools were used in a prior round, force one
      // more tool-free round so the model always produces a follow-up summary.
      if (!roundHasText && hadToolsExecution && !summaryForced) {
        summaryForced = true;
        forceNextRoundNoTools = true;
        messages.push({
          id: generateId(),
          role: "user",
          content: [{ type: "text", text: "Please summarise what you just did and highlight any key results or next steps." }],
          createdAt: Date.now(),
        });
        continue;
      }
      onComplete(totalUsage);
      return;
    }

    // Infinite loop detection: track how many times each unique call has been made
    for (const tc of pendingToolCalls) {
      const sig = `${tc.name}:${JSON.stringify(tc.input)}`;
      const count = (toolCallHistory.get(sig) ?? 0) + 1;
      toolCallHistory.set(sig, count);
      if (count >= 3) {
        onError(new Error(
          `Infinite tool loop detected: "${tc.name}" called 3× with identical arguments. ` +
          `Stopping to prevent runaway execution.`
        ));
        return;
      }
    }

    const toolCallContent: MessageContent[] = pendingToolCalls.map((tc) => ({
      type: "tool_use",
      toolCallId: tc.id,
      toolName: tc.name,
      toolInput: tc.input,
    }));

    // Add assistant message with tool calls to the internal context
    messages.push({
      id: generateId(),
      role: "assistant",
      content: toolCallContent,
      createdAt: Date.now(),
    });

    // Execute all tool calls in parallel.
    // Each call gets its own try/catch so Promise.all never rejects —
    // this ensures onToolResult is always called for every announced tool call,
    // preventing orphaned tool_use items in the conversation store.
    const results = await Promise.all(
      pendingToolCalls.map(async (tc) => {
        try {
          const result = await toolRegistry.execute(tc.name, tc.input, signal);
          result.toolCallId = tc.id;
          onToolResult(result);
          return result;
        } catch (toolErr) {
          const errResult = {
            toolCallId: tc.id,
            toolName: tc.name,
            isError: true as const,
            content: signal?.aborted
              ? "Tool execution was cancelled."
              : toolErr instanceof Error ? toolErr.message : String(toolErr),
          };
          onToolResult(errResult);
          return errResult;
        }
      }),
    );
    hadToolsExecution = true;

    // If the run was aborted, stop here rather than sending another LLM round.
    if (signal?.aborted) {
      onError(new DOMException("Run was aborted", "AbortError"));
      return;
    }

    // ask_user is a chat-human handoff tool. When invoked successfully, stop the
    // current run and wait for the next human message before continuing.
    if (results.some((r) => !r.isError && r.toolName === "ask_user")) {
      onComplete(totalUsage);
      return;
    }

    // Add tool results as a user/tool message for the next round
    const resultContent: MessageContent[] = results.map((r) => ({
      type: "tool_result",
      toolCallId: r.toolCallId,
      toolName: r.toolName,
      isError: r.isError,
      content: r.content,
    }));

    messages.push({
      id: generateId(),
      role: "tool",
      content: resultContent,
      createdAt: Date.now(),
    });
  }

  // Should be unreachable — last round strips tools so model gives text
  onError(new Error(`Agent exceeded maximum tool rounds (${MAX_TOOL_ROUNDS})`));
}

