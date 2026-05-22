import { toolRegistry } from "./registry";
import type { ToolResult } from "@zenon/shared-types";
import { ASK_USER_CONFIRM_OPTIONS, isAskUserQuestionType } from "./askUser";

const MAX_ASK_USER_OPTIONS = 12;

/** fetch_webpage tool — reads a URL and returns readable text */
toolRegistry.register({
  definition: {
    name: "fetch_webpage",
    description:
      "Fetch the content of a web page and return its readable text. Useful for reading documentation, articles, or any web resource.",
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
          description:
            "Optional CSS selector to extract a specific part of the page",
        },
      },
      required: ["url"],
    },
  },
  executor: async (input, signal): Promise<ToolResult> => {
    const { url, selector } = input as { url: string; selector?: string };

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
    for (const el of doc.querySelectorAll(
      "script,style,nav,footer,aside,header",
    )) {
      el.remove();
    }

    let content: string;
    if (selector) {
      const el = doc.querySelector(selector);
      content = el?.textContent ?? `Selector "${selector}" not found`;
    } else {
      // Try article/main first, fallback to body
      const main =
        doc.querySelector("article") ??
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

/** ask_user tool */
toolRegistry.register({
  definition: {
    name: "ask_user",
    description:
      "Ask the human in chat for follow-up input and pause the agent until they respond. Supports open, confirmation, single-choice, and multiple-choice questions.",
    category: "utility",
    inputSchema: {
      type: "object",
      properties: {
        question: {
          type: "string",
          description: "Question to show to the human in chat",
        },
        questionType: {
          type: "string",
          description:
            "Question mode: open (free text), confirm (yes/no confirmation), single_choice (one option), multiple_choice (multiple options).",
          enum: ["open", "confirm", "single_choice", "multiple_choice"],
          default: "open",
        },
        options: {
          type: "array",
          description: "Selectable options for confirm/single_choice/multiple_choice questions",
          items: { type: "string" },
        },
        placeholder: {
          type: "string",
          description: "Optional placeholder text for open questions",
        },
        minSelections: {
          type: "number",
          description: "Minimum selections for multiple_choice (default: 1)",
        },
        maxSelections: {
          type: "number",
          description: "Maximum selections for multiple_choice (default: options length)",
        },
      },
      required: ["question"],
    },
  },
  executor: async (input): Promise<ToolResult> => {
    const question = typeof input.question === "string" ? input.question.trim() : "";
    const questionTypeRaw = typeof input.questionType === "string" ? input.questionType : "open";
    const questionType = isAskUserQuestionType(questionTypeRaw)
      ? questionTypeRaw
      : "open";

    if (!question) {
      return {
        toolCallId: "",
        toolName: "ask_user",
        isError: true,
        content: "The 'question' field is required and cannot be empty.",
      };
    }

    const rawOptions = Array.isArray(input.options)
      ? input.options.filter((opt): opt is string => typeof opt === "string")
      : [];
    const baseOptions = rawOptions.map((opt) => opt.trim()).filter(Boolean).slice(0, MAX_ASK_USER_OPTIONS);
    const options = questionType === "confirm" && baseOptions.length === 0
      ? [...ASK_USER_CONFIRM_OPTIONS]
      : baseOptions;
    if ((questionType === "single_choice" || questionType === "multiple_choice") && options.length === 0) {
      return {
        toolCallId: "",
        toolName: "ask_user",
        isError: true,
        content: `Question type "${questionType}" requires a non-empty 'options' array.`,
      };
    }

    const placeholder = typeof input.placeholder === "string" ? input.placeholder : "";
    const minRaw = Number(input.minSelections);
    const maxRaw = Number(input.maxSelections);
    const minSelections = Number.isFinite(minRaw) ? Math.max(1, Math.floor(minRaw)) : 1;
    const maxSelections = Number.isFinite(maxRaw)
      ? Math.max(minSelections, Math.floor(maxRaw))
      : Math.max(minSelections, options.length || 1);

    return {
      toolCallId: "",
      toolName: "ask_user",
      isError: false,
      content: JSON.stringify({
        type: "human_input_request",
        question,
        questionType,
        options,
        placeholder,
        minSelections,
        maxSelections,
      }),
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
  executor: async (input): Promise<ToolResult> => {
    const { format = "all", timezone } = input as {
      format?: string;
      timezone?: string;
    };
    const now = new Date();

    const opts: Intl.DateTimeFormatOptions = {
      timeZone: timezone,
      dateStyle: "full",
      timeStyle: "long",
    };

    const parts: Record<string, string | number> = {
      iso: now.toISOString(),
      locale: now.toLocaleString(undefined, opts),
      unix: now.getTime(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };

    let result: string;
    if (format === "all") {
      result = Object.entries(parts)
        .map(([k, v]) => `${k}: ${v}`)
        .join("\n");
    } else {
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
    description:
      "Evaluate a mathematical expression. Supports standard arithmetic, Math functions, and constants.",
    category: "utility",
    inputSchema: {
      type: "object",
      properties: {
        expression: {
          type: "string",
          description:
            "JavaScript math expression, e.g., '2 + 2', 'Math.sqrt(16)', 'Math.PI * 5 ** 2'",
        },
      },
      required: ["expression"],
    },
  },
  executor: async (input): Promise<ToolResult> => {
    const { expression } = input as { expression: string };

    // Safe evaluation — only allow math operations
    const sanitized = expression.replace(/[^0-9+\-*/().,%^eMathsqrlogpitansinacoflourbiexd\s]/g, "");

    try {
      // eslint-disable-next-line no-new-func
      const result = new Function(`"use strict"; return (${sanitized})`)() as unknown;
      return {
        toolCallId: "",
        toolName: "calculator",
        isError: false,
        content: `${expression} = ${String(result)}`,
      };
    } catch (err) {
      return {
        toolCallId: "",
        toolName: "calculator",
        isError: true,
        content: `Failed to evaluate expression: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  },
});
