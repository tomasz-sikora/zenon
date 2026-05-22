import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Message } from "@zenon/shared-types";

const completeMock = vi.fn();
const getDefinitionsByNamesMock = vi.fn();
const executeMock = vi.fn();

vi.mock("@/lib/providers", () => ({
  createProvider: () => ({ complete: completeMock }),
  getProxyBaseUrl: () => "",
}));

vi.mock("@/store/providerStore", () => ({
  useProviderStore: {
    getState: () => ({
      providers: [{ id: "openai", type: "openai", name: "OpenAI" }],
      getApiKey: () => "test-key",
    }),
  },
}));

vi.mock("@/store/skillStore", () => ({
  useSkillStore: {
    getState: () => ({ skills: [] }),
  },
}));

vi.mock("@/store/workspaceStore", () => ({
  useWorkspaceStore: {
    getState: () => ({
      currentWorkspaceId: "default",
      workspaces: [{ id: "default", name: "Default" }],
    }),
  },
}));

vi.mock("@/lib/storage/workspace", () => ({
  workspacePaths: {
    files: () => "/workspaces/default/files",
    artifacts: () => "/workspaces/default/artifacts",
  },
}));

vi.mock("@/lib/tools/registry", () => ({
  toolRegistry: {
    getDefinitionsByNames: getDefinitionsByNamesMock,
    execute: executeMock,
  },
}));

describe("runAgent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("pauses after ask_user tool result and waits for human response", async () => {
    getDefinitionsByNamesMock.mockReturnValue([
      {
        name: "ask_user",
        description: "Ask user",
        category: "utility",
        inputSchema: { type: "object", properties: {} },
      },
    ]);
    executeMock.mockResolvedValue({
      toolCallId: "",
      toolName: "ask_user",
      isError: false,
      content: JSON.stringify({
        type: "human_input_request",
        question: "Proceed?",
        questionType: "confirm",
        options: ["Yes", "No"],
      }),
    });

    completeMock.mockImplementation(async (_req: unknown, onChunk: (chunk: unknown) => void) => {
      onChunk({
        type: "tool_call_end",
        toolCallId: "tc-1",
        toolName: "ask_user",
        toolInput: { question: "Proceed?", questionType: "confirm", options: ["Yes", "No"] },
      });
      onChunk({
        type: "done",
        usage: { inputTokens: 11, outputTokens: 7 },
      });
    });

    const { runAgent } = await import("./runner");
    const onComplete = vi.fn();
    const onToolCall = vi.fn();
    const onToolResult = vi.fn();
    const onError = vi.fn();
    const messages: Message[] = [
      { id: "u1", role: "user", content: [{ type: "text", text: "Hi" }], createdAt: Date.now() },
    ];

    await runAgent({
      conversation: { id: "c1", messages },
      agent: {
        id: "a1",
        name: "Agent",
        description: "",
        avatar: "🤖",
        instructions: "",
        model: { providerId: "openai", modelId: "gpt-4o-mini" },
        tools: ["ask_user"],
        knowledgeFiles: [],
        ragEnabled: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      onChunk: vi.fn(),
      onToolCall,
      onToolResult,
      onComplete,
      onError,
    });

    expect(completeMock).toHaveBeenCalledTimes(1);
    expect(onToolCall).toHaveBeenCalledTimes(1);
    expect(onToolResult).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });
});
