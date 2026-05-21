import { extractSystemPrompt } from "./base";
import { generateId } from "../utils";
export class GeminiProvider {
    id = "gemini";
    name = "Google Gemini";
    apiKey;
    /** Proxy base path to avoid CORS — defaults to "/api/gemini" */
    proxyUrl;
    constructor(opts) {
        if (typeof opts === "string") {
            this.apiKey = opts;
            this.proxyUrl = "/api/gemini";
        }
        else {
            this.apiKey = opts.apiKey;
            this.proxyUrl = opts.proxyUrl ?? "/api/gemini";
        }
    }
    async complete(opts, onChunk) {
        const systemPrompt = extractSystemPrompt(opts.messages);
        const contents = messagesToGemini(opts.messages);
        const modelId = opts.messages.find((m) => m.role === "assistant")?.modelId ??
            "gemini-2.5-flash";
        const body = {
            contents,
            generationConfig: {
                temperature: opts.temperature,
                maxOutputTokens: opts.maxTokens,
            },
        };
        if (systemPrompt) {
            body["systemInstruction"] = { parts: [{ text: systemPrompt }] };
        }
        if (opts.tools && opts.tools.length > 0) {
            body["tools"] = [{ functionDeclarations: toolsToGemini(opts.tools) }];
        }
        const stream = opts.stream !== false;
        const endpoint = stream ? "streamGenerateContent" : "generateContent";
        // Route through proxy to avoid CORS — proxy forwards to Google with the API key
        const url = `${this.proxyUrl}/models/${modelId}:${endpoint}${stream ? "?alt=sse" : ""}`;
        const resp = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Gemini-API-Key": this.apiKey,
            },
            body: JSON.stringify(body),
            signal: opts.signal ?? null,
        });
        if (!resp.ok) {
            const err = await resp.text();
            throw new Error(`Gemini API error ${resp.status}: ${err}`);
        }
        if (!stream) {
            const data = (await resp.json());
            emitGeminiResponse(data, onChunk);
            return;
        }
        const reader = resp.body?.getReader();
        if (!reader)
            throw new Error("No response body");
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
                if (!line.startsWith("data: "))
                    continue;
                try {
                    const data = JSON.parse(line.slice(6));
                    emitGeminiResponse(data, onChunk);
                }
                catch {
                    // ignore
                }
            }
        }
        onChunk({ type: "done" });
    }
}
function emitGeminiResponse(data, onChunk) {
    const candidate = data.candidates?.[0];
    if (!candidate)
        return;
    for (const part of candidate.content?.parts ?? []) {
        if (part.text) {
            onChunk({ type: "text", text: part.text });
        }
        if (part.functionCall) {
            const id = generateId();
            onChunk({
                type: "tool_call_end",
                toolCallId: id,
                toolName: part.functionCall.name,
                toolInput: part.functionCall.args,
            });
        }
    }
    if (data.usageMetadata) {
        onChunk({
            type: "done",
            usage: {
                inputTokens: data.usageMetadata.promptTokenCount ?? 0,
                outputTokens: data.usageMetadata.candidatesTokenCount ?? 0,
            },
        });
    }
}
function messagesToGemini(messages) {
    return messages
        .filter((m) => m.role !== "system")
        .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: buildGeminiParts(m.content),
    }));
}
function buildGeminiParts(blocks) {
    const parts = [];
    for (const block of blocks) {
        if (block.type === "text") {
            parts.push({ text: block.text });
        }
        else if (block.type === "image") {
            if (block.url.startsWith("data:")) {
                const [header, data] = block.url.split(",");
                const mimeType = header?.split(":")[1]?.split(";")[0] ?? "image/jpeg";
                parts.push({ inlineData: { mimeType, data } });
            }
        }
    }
    return parts;
}
function toolsToGemini(tools) {
    return tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.inputSchema,
    }));
}
