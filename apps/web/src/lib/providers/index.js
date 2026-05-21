import { OpenAIProvider } from "./openai";
import { AnthropicProvider } from "./anthropic";
import { GeminiProvider } from "./gemini";
import { LocalWebGPUProvider } from "./local-webgpu";
/**
 * Factory: create the right provider instance given config + API key.
 * For Anthropic/Bedrock, requests are routed through the local proxy to avoid CORS.
 */
export function createProvider(config, apiKey, proxyBaseUrl) {
    switch (config.type) {
        case "openai":
        case "openai-compatible": {
            const providerOpts = {
                id: config.id,
                name: config.name,
                apiKey,
            };
            if (config.baseUrl)
                providerOpts.baseUrl = config.baseUrl;
            // Always route through the built-in proxy for absolute URLs to avoid CORS.
            // Relative paths (e.g. /ollama/v1) are served by nginx on the same origin — no CORS.
            const isAbsolute = !config.baseUrl || config.baseUrl.startsWith("http://") || config.baseUrl.startsWith("https://");
            if (isAbsolute) {
                providerOpts.proxyUrl = "/api/chat";
            }
            return new OpenAIProvider(providerOpts);
        }
        case "anthropic": {
            // Always route through local proxy — Anthropic doesn't allow direct browser requests.
            return new AnthropicProvider({
                id: config.id,
                name: config.name,
                apiKey,
                // proxyUrl defaults to "/api/anthropic" inside AnthropicProvider
            });
        }
        case "gemini":
            // Always route through local proxy — Google's API doesn't set CORS headers for browsers.
            return new GeminiProvider({ apiKey, proxyUrl: "/api/gemini" });
        case "bedrock":
            // Bedrock requires SigV4 signing — always use proxy
            if (!proxyBaseUrl) {
                throw new Error("AWS Bedrock requires a proxy server. Please configure the proxy URL in settings.");
            }
            // Bedrock proxy exposes an OpenAI-compatible endpoint
            return new OpenAIProvider({
                id: config.id,
                name: config.name,
                baseUrl: `${proxyBaseUrl}/api/bedrock`,
                apiKey, // Access key + secret passed as token: "key:secret:region"
            });
        case "local-webgpu":
            return new LocalWebGPUProvider({ id: config.id, name: config.name });
        case "local-wasm":
            throw new Error(`Local model support (${config.type}) is not implemented.`);
        default:
            throw new Error(`Unknown provider type: ${config.type}`);
    }
}
/** Get the proxy base URL from localStorage / env */
export function getProxyBaseUrl() {
    return localStorage.getItem("zenon-proxy-url") ?? undefined;
}
