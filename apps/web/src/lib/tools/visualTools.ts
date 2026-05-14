/**
 * Visual tools — create charts, diagrams using Chart.js and Mermaid.js.
 * Outputs are saved as PNG/SVG artifacts in the workspace.
 */

import { toolRegistry } from "./registry";
import { writeFile } from "@/lib/storage/opfs";

// ─── Chart creation ──────────────────────────────────────────────────────────
toolRegistry.register({
  name: "create_chart",
  description:
    "Create a chart (bar, line, pie, scatter, doughnut) and save it as a PNG image. " +
    "Returns the file path and a data URI preview.",
  inputSchema: {
    type: "object",
    properties: {
      type: { type: "string", enum: ["bar", "line", "pie", "scatter", "doughnut"], description: "Chart type" },
      labels: { type: "array", items: { type: "string" }, description: "X-axis labels" },
      datasets: {
        type: "array",
        description: "Array of dataset objects with label and data",
        items: {
          type: "object",
          properties: {
            label: { type: "string" },
            data: { type: "array", items: { type: "number" } },
          },
        },
      },
      title: { type: "string", description: "Chart title" },
      path: { type: "string", description: "Output path (e.g. 'workspaces/ws-id/artifacts/chart.png')" },
      width: { type: "number", description: "Width in pixels (default 800)" },
      height: { type: "number", description: "Height in pixels (default 500)" },
    },
    required: ["type", "labels", "datasets", "path"],
  },
  execute: async (args: Record<string, unknown>) => {
    const { Chart, registerables } = await import("chart.js");
    Chart.register(...registerables);

    const width = (args["width"] as number | undefined) ?? 800;
    const height = (args["height"] as number | undefined) ?? 500;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;

    // White background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    const colors = [
      "#6366f1", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6",
      "#06b6d4", "#84cc16", "#f97316", "#ec4899", "#14b8a6",
    ];

    const datasets = (args["datasets"] as Array<{ label: string; data: number[] }>).map((ds, i) => ({
      ...ds,
      backgroundColor: colors[i % colors.length] + "cc",
      borderColor: colors[i % colors.length],
      borderWidth: 1,
    }));

    const chart = new Chart(ctx, {
      type: args["type"] as "bar",
      data: { labels: args["labels"] as string[], datasets },
      options: {
        responsive: false,
        animation: false,
        plugins: {
          title: args["title"] ? { display: true, text: args["title"] as string } : undefined,
          legend: { display: true },
        },
      },
    });

    chart.render();

    const dataUrl = canvas.toDataURL("image/png");
    const base64 = dataUrl.split(",")[1];
    const buf = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

    chart.destroy();

    const path = args["path"] as string;
    await writeFile(path, buf.buffer);
    return { path, dataUri: dataUrl, width, height };
  },
});

// ─── Mermaid diagram ─────────────────────────────────────────────────────────
toolRegistry.register({
  name: "create_diagram",
  description:
    "Render a Mermaid diagram (flowchart, sequence, class, ER, Gantt, etc.) to SVG. " +
    "Returns the SVG as a string and saves to the specified path.",
  inputSchema: {
    type: "object",
    properties: {
      definition: {
        type: "string",
        description: "Mermaid diagram definition code",
      },
      path: {
        type: "string",
        description: "Output path for the .svg file",
      },
    },
    required: ["definition", "path"],
  },
  execute: async (args: Record<string, unknown>) => {
    const mermaid = (await import("mermaid")).default;
    mermaid.initialize({ startOnLoad: false, theme: "default" });

    const definition = args["definition"] as string;
    const path = args["path"] as string;

    const id = `zenon-diagram-${Date.now()}`;
    const { svg } = await mermaid.render(id, definition);
    await writeFile(path, svg);
    return { path, svg };
  },
});
