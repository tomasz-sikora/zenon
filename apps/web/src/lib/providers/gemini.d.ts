import type { AIProvider, CompletionOptions, StreamCallback } from "./base";
export declare class GeminiProvider implements AIProvider {
    id: string;
    name: string;
    private apiKey;
    /** Proxy base path to avoid CORS — defaults to "/api/gemini" */
    private proxyUrl;
    constructor(opts: string | {
        apiKey: string;
        proxyUrl?: string;
    });
    complete(opts: CompletionOptions, onChunk: StreamCallback): Promise<void>;
}
