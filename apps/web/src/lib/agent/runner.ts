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
    ...conversation.messages,
  ];

  let round = 0;
  // Track tool call signatures for infinite loop detection: sig → times seen
  const toolCallHistory = new Map<string, number>();

  while (round < MAX_TOOL_ROUNDS) {
    round++;

    // On the final allowed round, strip tools → forces a text-only response / summary
    const isLastRound = round === MAX_TOOL_ROUNDS;
    const roundTools = isLastRound ? [] : tools;

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

    // Execute all tool calls in parallel
    const results = await Promise.all(
      pendingToolCalls.map(async (tc) => {
        const result = await toolRegistry.execute(tc.name, tc.input, signal);
        result.toolCallId = tc.id;
        onToolResult(result);
        return result;
      }),
    );

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


