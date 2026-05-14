/**
 * Office document tools — read/write PDF, Excel, CSV, Word documents.
 * All processing happens in the browser using WASM-compatible libraries.
 */

import { toolRegistry } from "./registry";
import { readFile, readFileText, writeFile } from "@/lib/storage/opfs";

// ─── PDF read ────────────────────────────────────────────────────────────────
toolRegistry.register({
  name: "read_pdf",
  description: "Extract text content from a PDF file. Returns the text from all pages.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Path to the PDF file" },
    },
    required: ["path"],
  },
  execute: async (args: Record<string, unknown>) => {
    const path = args["path"] as string;
    const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist");
    // Use CDN worker to avoid bundling issues
    GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${(await import("pdfjs-dist")).version}/build/pdf.worker.min.mjs`;

    const buf = await readFile(path);
    const pdf = await getDocument({ data: buf }).promise;
    const pages: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      pages.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
    }
    return { pages, numPages: pdf.numPages, text: pages.join("\n\n") };
  },
});

// ─── PDF create ──────────────────────────────────────────────────────────────
toolRegistry.register({
  name: "create_pdf",
  description: "Create a PDF file from text content. Returns the path to the created PDF.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Output path for the PDF" },
      content: { type: "string", description: "Text content to put in the PDF" },
      title: { type: "string", description: "Document title" },
    },
    required: ["path", "content"],
  },
  execute: async (args: Record<string, unknown>) => {
    const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
    const path = args["path"] as string;
    const content = args["content"] as string;
    const title = (args["title"] as string | undefined) ?? "Document";

    const pdfDoc = await PDFDocument.create();
    pdfDoc.setTitle(title);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const pageWidth = 595, pageHeight = 842, margin = 50, lineHeight = 14, fontSize = 11;
    const maxWidth = pageWidth - margin * 2;

    const lines = content.split("\n").flatMap((line) => {
      if (!line.trim()) return [""];
      const words = line.split(" ");
      const wrappedLines: string[] = [];
      let current = "";
      for (const word of words) {
        const test = current ? current + " " + word : word;
        if (font.widthOfTextAtSize(test, fontSize) > maxWidth && current) {
          wrappedLines.push(current);
          current = word;
        } else { current = test; }
      }
      if (current) wrappedLines.push(current);
      return wrappedLines;
    });

    let page = pdfDoc.addPage([pageWidth, pageHeight]);
    let y = pageHeight - margin;
    for (const line of lines) {
      if (y < margin + lineHeight) {
        page = pdfDoc.addPage([pageWidth, pageHeight]);
        y = pageHeight - margin;
      }
      if (line) page.drawText(line, { x: margin, y, size: fontSize, font, color: rgb(0, 0, 0) });
      y -= lineHeight;
    }

    const bytes = await pdfDoc.save();
    await writeFile(path, bytes.buffer as ArrayBuffer);
    return { path, pages: pdfDoc.getPageCount(), bytes: bytes.length };
  },
});

// ─── Excel read ──────────────────────────────────────────────────────────────
toolRegistry.register({
  name: "read_excel",
  description: "Read an Excel (.xlsx/.xls) file. Returns sheet names and data as JSON.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Path to the Excel file" },
      sheet: { type: "string", description: "Sheet name (default: first sheet)" },
    },
    required: ["path"],
  },
  execute: async (args: Record<string, unknown>) => {
    const XLSX = await import("xlsx");
    const path = args["path"] as string;
    const sheetName = args["sheet"] as string | undefined;
    const buf = await readFile(path);
    const wb = XLSX.read(new Uint8Array(buf), { type: "array" });
    const name = sheetName ?? wb.SheetNames[0] ?? "";
    const ws = wb.Sheets[name];
    if (!ws) throw new Error(`Sheet "${name}" not found. Available: ${wb.SheetNames.join(", ")}`);
    const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
    return { sheet: name, sheets: wb.SheetNames, rows: data, rowCount: (data as unknown[]).length };
  },
});

// ─── Excel write ─────────────────────────────────────────────────────────────
toolRegistry.register({
  name: "write_excel",
  description: "Write data to an Excel file. Accepts JSON array of arrays (rows x columns).",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Output path" },
      data: { type: "array", description: "Array of arrays: rows[columns]" },
      sheet: { type: "string", description: "Sheet name (default: Sheet1)" },
    },
    required: ["path", "data"],
  },
  execute: async (args: Record<string, unknown>) => {
    const XLSX = await import("xlsx");
    const path = args["path"] as string;
    const data = args["data"] as unknown[][];
    const sheetName = (args["sheet"] as string | undefined) ?? "Sheet1";
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    await writeFile(path, buf);
    return { path, rows: data.length, sheet: sheetName };
  },
});

// ─── CSV read ─────────────────────────────────────────────────────────────────
toolRegistry.register({
  name: "read_csv",
  description: "Read and parse a CSV file. Returns parsed rows as JSON.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Path to the CSV file" },
      header: { type: "boolean", description: "First row is header (default: true)", default: true },
      limit: { type: "number", description: "Max rows to return (default: 1000)" },
    },
    required: ["path"],
  },
  execute: async (args: Record<string, unknown>) => {
    const Papa = await import("papaparse");
    const path = args["path"] as string;
    const header = (args["header"] as boolean | undefined) ?? true;
    const limit = (args["limit"] as number | undefined) ?? 1000;
    const text = await readFileText(path);
    const result = Papa.parse(text, { header, skipEmptyLines: true });
    const rows = (result.data as unknown[]).slice(0, limit);
    return { rows, rowCount: rows.length, totalRows: (result.data as unknown[]).length, fields: result.meta.fields };
  },
});

// ─── Word read ────────────────────────────────────────────────────────────────
toolRegistry.register({
  name: "read_word",
  description: "Extract text from a Word (.docx) file.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Path to the .docx file" },
    },
    required: ["path"],
  },
  execute: async (args: Record<string, unknown>) => {
    const mammoth = await import("mammoth");
    const path = args["path"] as string;
    const buf = await readFile(path);
    const result = await mammoth.extractRawText({ arrayBuffer: buf });
    return { text: result.value, messages: result.messages };
  },
});
