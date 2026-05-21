import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Message, ToolResultContent } from "@zenon/shared-types";
import { MessageBubble } from "./MessageBubble";

describe("MessageBubble ask_user integration", () => {
  it("renders predefined answers and sends selected response", async () => {
    const onSubmitToolPromptResponse = vi.fn();
    const message: Message = {
      id: "m1",
      role: "assistant",
      createdAt: Date.now(),
      content: [
        {
          type: "tool_use",
          toolCallId: "tc1",
          toolName: "ask_user",
          toolInput: {
            question: "Choose deployment mode",
            questionType: "single_choice",
            options: ["Blue/Green", "Canary"],
          },
        },
      ],
    };
    const resultMap = new Map<string, ToolResultContent>([
      [
        "tc1",
        {
          type: "tool_result",
          toolCallId: "tc1",
          toolName: "ask_user",
          isError: false,
          content: JSON.stringify({
            type: "human_input_request",
            question: "Choose deployment mode",
            questionType: "single_choice",
            options: ["Blue/Green", "Canary"],
          }),
        },
      ],
    ]);

    render(
      <MessageBubble
        message={message}
        isStreaming={false}
        toolResultMap={resultMap}
        onEditMessage={vi.fn()}
        onRetryMessage={vi.fn()}
        onSubmitToolPromptResponse={onSubmitToolPromptResponse}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Canary" }));

    expect(onSubmitToolPromptResponse).toHaveBeenCalledWith(
      'ask_user_response: {"question":"Choose deployment mode","answer":"Canary"}',
    );
  });
});
