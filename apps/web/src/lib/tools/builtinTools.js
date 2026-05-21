import { toolRegistry } from "./registry";
/** fetch_webpage tool — reads a URL and returns readable text */
toolRegistry.register({
    definition: {
        name: "fetch_webpage",
        description: "Fetch the content of a web page and return its readable text. Useful for reading documentation, articles, or any web resource.",
        category: "web",
        inputSchema: {
            type: "object",
            properties: {
                url: {
                    type: "string",
                    description: "The URL of the web page to fetch",
                },
                selector: {
                    type: "string",
                    description: "Optional CSS selector to extract a specific part of the page",
                },
            },
            required: ["url"],
        },
    },
    executor: async (input, signal) => {
        const { url, selector } = input;
        let fetchUrl = url;
        // Use a CORS proxy for cross-origin requests
        if (!url.startsWith(window.location.origin)) {
            fetchUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
        }
        const resp = await fetch(fetchUrl, {
            signal: signal ?? null,
            headers: { Accept: "text/html,application/xhtml+xml,*/*" },
        });
        if (!resp.ok) {
            return {
                toolCallId: "",
                toolName: "fetch_webpage",
                isError: true,
                content: `Failed to fetch ${url}: HTTP ${resp.status}`,
            };
        }
        const html = await resp.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");
        // Remove scripts, styles, nav, footer for cleaner text
        for (const el of doc.querySelectorAll("script,style,nav,footer,aside,header")) {
            el.remove();
        }
        let content;
        if (selector) {
            const el = doc.querySelector(selector);
            content = el?.textContent ?? `Selector "${selector}" not found`;
        }
        else {
            // Try article/main first, fallback to body
            const main = doc.querySelector("article") ??
                doc.querySelector("main") ??
                doc.body;
            content = main?.innerText ?? main?.textContent ?? "";
        }
        // Clean up whitespace
        content = content
            .split("\n")
            .map((l) => l.trim())
            .filter((l) => l.length > 0)
            .join("\n")
            .slice(0, 20000); // limit to 20k chars
        return {
            toolCallId: "",
            toolName: "fetch_webpage",
            isError: false,
            content: `URL: ${url}\n\n${content}`,
        };
    },
});
/** datetime tool */
toolRegistry.register({
    definition: {
        name: "datetime",
        description: "Get the current date and time in various formats",
        category: "utility",
        inputSchema: {
            type: "object",
            properties: {
                format: {
                    type: "string",
                    description: "Format: 'iso', 'locale', 'unix', or 'all'",
                    enum: ["iso", "locale", "unix", "all"],
                    default: "all",
                },
                timezone: {
                    type: "string",
                    description: "IANA timezone (e.g., 'America/New_York'). Defaults to local.",
                },
            },
        },
    },
    executor: async (input) => {
        const { format = "all", timezone } = input;
        const now = new Date();
        const opts = {
            timeZone: timezone,
            dateStyle: "full",
            timeStyle: "long",
        };
        const parts = {
            iso: now.toISOString(),
            locale: now.toLocaleString(undefined, opts),
            unix: now.getTime(),
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        };
        let result;
        if (format === "all") {
            result = Object.entries(parts)
                .map(([k, v]) => `${k}: ${v}`)
                .join("\n");
        }
        else {
            result = String(parts[format] ?? "unknown format");
        }
        return {
            toolCallId: "",
            toolName: "datetime",
            isError: false,
            content: result,
        };
    },
});
/** calculator tool */
toolRegistry.register({
    definition: {
        name: "calculator",
        description: "Evaluate a mathematical expression. Supports standard arithmetic, Math functions, and constants.",
        category: "utility",
        inputSchema: {
            type: "object",
            properties: {
                expression: {
                    type: "string",
                    description: "JavaScript math expression, e.g., '2 + 2', 'Math.sqrt(16)', 'Math.PI * 5 ** 2'",
                },
            },
            required: ["expression"],
        },
    },
    executor: async (input) => {
        const { expression } = input;
        // Safe evaluation — only allow math operations
        const sanitized = expression.replace(/[^0-9+\-*/().,%^eMathsqrlogpitansinacoflourbiexd\s]/g, "");
        try {
            // eslint-disable-next-line no-new-func
            const result = new Function(`"use strict"; return (${sanitized})`)();
            return {
                toolCallId: "",
                toolName: "calculator",
                isError: false,
                content: `${expression} = ${String(result)}`,
            };
        }
        catch (err) {
            return {
                toolCallId: "",
                toolName: "calculator",
                isError: true,
                content: `Failed to evaluate expression: ${err instanceof Error ? err.message : String(err)}`,
            };
        }
    },
});
