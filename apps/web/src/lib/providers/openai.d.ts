import type { AIProvider, CompletionOptions, StreamCallback } from "./base";
export declare class OpenAIProvider implements AIProvider {
    id: string;
    name: string;
    private baseUrl;
    private apiKey;
    /** When set, requests are routed through this proxy path to avoid CORS */
    private proxyUrl?;
    constructor(opts: {
        id: string;
        name: string;
        baseUrl?: string;
        apiKey: string;
        /** Optional proxy path (e.g. "/api/chat") — routes requests server-side */
        proxyUrl?: string;
    });
    complete(opts: CompletionOptions, onChunk: StreamCallback): Promise<void>;
}
