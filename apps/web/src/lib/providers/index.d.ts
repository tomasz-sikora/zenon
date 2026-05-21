import type { AIProvider } from "./base";
import type { ProviderConfig } from "@zenon/shared-types";
export type { AIProvider, CompletionOptions, CompletionChunk, StreamCallback } from "./base";
/**
 * Factory: create the right provider instance given config + API key.
 * For Anthropic/Bedrock, requests are routed through the local proxy to avoid CORS.
 */
export declare function createProvider(config: ProviderConfig, apiKey: string, proxyBaseUrl?: string): AIProvider;
/** Get the proxy base URL from localStorage / env */
export declare function getProxyBaseUrl(): string | undefined;
