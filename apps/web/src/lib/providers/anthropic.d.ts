import type { AIProvider, CompletionOptions, StreamCallback } from "./base";
export declare class AnthropicProvider implements AIProvider {
    id: string;
    name: string;
    private apiKey;
    /** Proxy base path — defaults to "/api/anthropic" (local nginx proxy) to avoid CORS */
    private proxyUrl;
    constructor(opts: {
        id: string;
        name: string;
        apiKey: string;
        /** Override proxy base. Defaults to "/api/anthropic". Pass "" to go direct (not recommended). */
        proxyUrl?: string;
    });
    complete(opts: CompletionOptions, onChunk: StreamCallback): Promise<void>;
}
