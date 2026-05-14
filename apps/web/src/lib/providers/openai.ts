import type { AIProvider, CompletionOptions, StreamCallback } from "./base";
import {
  messagesToOpenAI,
  toolsToOpenAI,
  extractSystemPrompt,
} from "./base";

export class OpenAIProvider implements AIProvider {
  id: string;
  name: string;
  private baseUrl: string;
  private apiKey: string;

  constructor(opts: {
    id: string;
    name: string;
    baseUrl?: string;
    apiKey: string;
  }) {
    this.id = opts.id;
    this.name = opts.name;
    this.baseUrl = opts.baseUrl ?? "https://api.openai.com/v1";
    this.apiKey = opts.apiKey;
  }

  async complete(
    opts: CompletionOptions,
    onChunk: StreamCallback,
  ): Promise<void> {
    const systemPrompt = extractSystemPrompt(opts.messages);
    const messages = [
      ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
      ...messagesToOpenAI(opts.messages),
    ];

    const body: Record<string, unknown> = {
      model: opts.modelId,
      messages,
      stream: opts.stream !== false,
      temperature: opts.temperature,
      max_tokens: opts.maxTokens,
      stream_options: opts.stream !== false ? { include_usage: true } : undefined,
    };

    if (opts.tools && opts.tools.length > 0) {
      body["tools"] = toolsToOpenAI(opts.tools);
      body["tool_choice"] = "auto";
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }

    const resp = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: opts.signal ?? null,
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`OpenAI API error ${resp.status}: ${err}`);
    }

    if (opts.stream === false) {
      const data = (await resp.json()) as {
        choices: Array<{
          message: {
            content?: string;
            tool_calls?: Array<{
              id: string;
              function: { name: string; arguments: string };
            }>;
          };
        }>;
        usage?: { prompt_tokens: number; completion_tokens: number };
      };
      const choice = data.choices[0];
      if (!choice) return;

      if (choice.message.content) {
        onChunk({ type: "text", text: choice.message.content });
      }
      for (const tc of choice.message.tool_calls ?? []) {
        onChunk({
          type: "tool_call_end",
          toolCallId: tc.id,
          toolName: tc.function.name,
          toolInput: JSON.parse(tc.function.arguments) as Record<string, unknown>,
        });
      }
      if (data.usage) {
        onChunk({
          type: "done",
          usage: {
            inputTokens: data.usage.prompt_tokens,
            outputTokens: data.usage.completion_tokens,
          },
        });
      }
      return;
    }

    // Streaming
    const reader = resp.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";
    const toolCallBuffers: Record<string, { id: string; name: string; args: string }> = {};
    const emitCompletedToolCalls = () => {
      for (const buf of Object.values(toolCallBuffers)) {
        try {
          onChunk({
            type: "tool_call_end",
            toolCallId: buf.id,
            toolName: buf.name,
            toolInput: JSON.parse(buf.args) as Record<string, unknown>,
          });
        } catch {
          // ignore malformed tool call arguments
        }
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6);
        if (data === "[DONE]") {
          emitCompletedToolCalls();
          onChunk({ type: "done" });
          return;
        }

        try {
          const chunk = JSON.parse(data) as {
            choices?: Array<{
              delta: {
                content?: string;
                tool_calls?: Array<{
                  index: number;
                  id?: string;
                  function?: { name?: string; arguments?: string };
                }>;
              };
            }>;
            usage?: { prompt_tokens: number; completion_tokens: number };
          };

          if (chunk.usage) {
            onChunk({
              type: "done",
              usage: {
                inputTokens: chunk.usage.prompt_tokens,
                outputTokens: chunk.usage.completion_tokens,
              },
            });
          }

          const delta = chunk.choices?.[0]?.delta;
          if (!delta) continue;

          if (delta.content) {
            onChunk({ type: "text", text: delta.content });
          }

          for (const tc of delta.tool_calls ?? []) {
            if (tc.id && tc.function?.name) {
              toolCallBuffers[tc.index] = {
                id: tc.id,
                name: tc.function.name,
                args: tc.function.arguments ?? "",
              };
              onChunk({
                type: "tool_call_start",
                toolCallId: tc.id,
                toolName: tc.function.name,
              });
            } else if (tc.function?.arguments) {
              const buf = toolCallBuffers[tc.index];
              if (buf) {
                buf.args += tc.function.arguments;
                onChunk({
                  type: "tool_call_delta",
                  toolInputDelta: tc.function.arguments,
                });
              }
            }
          }
        } catch {
          // ignore malformed chunks
        }
      }
    }

    emitCompletedToolCalls();
  }
}
