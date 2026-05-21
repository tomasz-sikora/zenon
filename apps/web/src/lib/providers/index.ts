import { OpenAIProvider } from "./openai";
import { AnthropicProvider } from "./anthropic";
import { GeminiProvider } from "./gemini";
import { LocalWebGPUProvider } from "./local-webgpu";
import type { AIProvider } from "./base";
import type { ProviderConfig } from "@zenon/shared-types";

export type { AIProvider, CompletionOptions, CompletionChunk, StreamCallback } from "./base";

/**
 * Factory: create the right provider instance given config + API key.
 * For Anthropic/Bedrock, requests are routed through the local proxy to avoid CORS.
 */
export function createProvider(
  config: ProviderConfig,
  apiKey: string,
  proxyBaseUrl?: string,
): AIProvider {
  switch (config.type) {
    case "openai":
    case "openai-compatible": {
      const providerOpts: Parameters<typeof OpenAIProvider.prototype.complete>[0] extends never
        ? never
        : { id: string; name: string; apiKey: string; baseUrl?: string; proxyUrl?: string } = {
        id: config.id,
        name: config.name,
        apiKey,
      };
      if (config.baseUrl) providerOpts.baseUrl = config.baseUrl;
      // Route openai-compatible providers with absolute URLs through the built-in proxy
      // to avoid CORS errors. Relative paths (e.g. /ollama/v1) go direct.
      if (
        config.type === "openai-compatible" &&
        config.baseUrl &&
        (config.baseUrl.startsWith("http://") || config.baseUrl.startsWith("https://"))
      ) {
        providerOpts.proxyUrl = "/api/chat";
      }
      return new OpenAIProvider(providerOpts);
    }

    case "anthropic": {
      const anthropicOpts: { id: string; name: string; apiKey: string; proxyUrl?: string } = {
        id: config.id,
        name: config.name,
        apiKey,
      };
      if (proxyBaseUrl) anthropicOpts.proxyUrl = proxyBaseUrl;
      return new AnthropicProvider(anthropicOpts);
    }

    case "gemini":
      return new GeminiProvider(apiKey);

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
export function getProxyBaseUrl(): string | undefined {
  return localStorage.getItem("zenon-proxy-url") ?? undefined;
}
