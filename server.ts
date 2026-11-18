import "dotenv/config";
import express from "express";
import path from "node:path";
import { getGeminiClient, runHelpDeskPipeline } from "./server/agents.ts";
import { ensureGeminiEmbeddings, KB_ARTICLES, KB_CHUNKS, retrieveKB, SIMILARITY_THRESHOLDS } from "./server/kb.ts";
import {
  callMcpTool,
  checkServiceStatus,
  createTicket,
  listTickets,
  MCP_TOOLS,
  updateTicket,
} from "./server/tools.ts";
import { runValidationSuite } from "./server/validation.ts";
import { maskSensitiveText, type SensitiveCategory } from "./src/lib/privacy.ts";
import type { ChatHistoryItem, RunMode, Severity, Ticket } from "./src/types.ts";

const PORT = 3000;

const ALLOWED_SENSITIVE_CATEGORIES = new Set<SensitiveCategory>([
  "private_key",
  "jwt_token",
  "api_key",
  "access_token",
  "credit_card",
  "bank_account",
  "ssn",
  "password",
  "email",
  "phone",
  "student_id",
]);

function getServerSecrets(): string[] {
  const key = process.env.GEMINI_API_KEY;
  return key && key !== "MY_GEMINI_API_KEY" && key.trim().length >= 8 ? [key.trim()] : [];
}

function sanitizeText(value: string): string {
  return maskSensitiveText(value, getServerSecrets()).masked;
}

function sanitizeUnknown(value: unknown): unknown {
  if (typeof value === "string") {
    return sanitizeText(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeUnknown(item));
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = sanitizeUnknown(v);
    }
    return out;
  }
  return value;
}

function sanitizeError(err: unknown, fallback: string): string {
  const msg = err instanceof Error ? err.message : fallback;
  return sanitizeText(msg);
}

async function startServer() {
  const app = express();
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    const ai = getGeminiClient();
    const serviceStatus = checkServiceStatus("all");
    res.json({
      ok: true,
      geminiAvailable: Boolean(ai),
      defaultMode: ai ? "gemini" : "offline",
      kbArticles: KB_ARTICLES.length,
      kbChunks: KB_CHUNKS.length,
      services: serviceStatus.services,
      checked: serviceStatus.checked,
    });
  });

  app.post("/api/chat", async (req, res) => {
    try {
      const rawQuery = String(req.body?.query ?? "").trim();
      if (!rawQuery) {
        res.status(400).json({ error: "Query is required" });
        return;
      }
      const secrets = getServerSecrets();
      const maskedQuery = maskSensitiveText(rawQuery, secrets);
      const userId = sanitizeText(String(req.body?.userId ?? "student_001"));
      const mode = (req.body?.mode as RunMode | "auto") ?? "auto";
      const forceHuman = Boolean(req.body?.forceHuman);
      const securityFix = req.body?.securityFix !== false;

      const rawHistory: unknown[] = Array.isArray(req.body?.history) ? req.body.history : [];
      const history: ChatHistoryItem[] = rawHistory
        .filter((h): h is ChatHistoryItem => Boolean(h && typeof h === "object"))
        .map((h) => ({
          role: h.role === "assistant" ? "assistant" : "user",
          text: sanitizeText(String(h.text ?? "")),
          category: h.category,
          citations: Array.isArray(h.citations) ? h.citations : undefined,
        }));

      const rawClientPii = Array.isArray(req.body?.clientDetectedPii)
        ? req.body.clientDetectedPii
        : [];
      const clientDetectedPii = Array.from(
        new Set([
          ...rawClientPii.filter(
            (t: unknown): t is SensitiveCategory =>
              typeof t === "string" && ALLOWED_SENSITIVE_CATEGORIES.has(t as SensitiveCategory)
          ),
          ...maskedQuery.detectedTypes,
        ])
      );

      const result = await runHelpDeskPipeline(maskedQuery.masked, {
        userId,
        mode,
        forceHuman,
        securityFix,
        history,
        clientDetectedPii,
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({
        error: sanitizeError(err, "Failed to run help desk pipeline"),
      });
    }
  });

  app.get("/api/tickets", (req, res) => {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const priority = typeof req.query.priority === "string" ? req.query.priority : undefined;
    const limit = typeof req.query.limit === "string" ? Number(req.query.limit) : 50;
    res.json({ tickets: listTickets({ status, priority, limit }) });
  });

  app.post("/api/tickets", (req, res) => {
    const user = sanitizeText(String(req.body?.user ?? "student_001"));
    const category = sanitizeText(String(req.body?.category ?? "other"));
    const priority = (req.body?.priority as Severity) ?? "P3";
    const summary = sanitizeText(String(req.body?.summary ?? "").trim());
    if (!summary) {
      res.status(400).json({ error: "Summary is required" });
      return;
    }
    const status = (req.body?.status as Ticket["status"]) ?? "open";
    const notes = req.body?.notes ? sanitizeText(String(req.body.notes)) : "";
    const created = createTicket({ user, category, priority, summary, status, notes });
    res.json(created);
  });

  app.patch("/api/tickets/:id", (req, res) => {
    const id = req.params.id;
    const status = req.body?.status as Ticket["status"] | undefined;
    if (!status) {
      res.status(400).json({ error: "Status is required" });
      return;
    }
    const notes = req.body?.notes !== undefined ? sanitizeText(String(req.body.notes)) : undefined;
    const csat = req.body?.csat !== undefined ? Number(req.body.csat) : undefined;
    const updated = updateTicket(id, status, notes, csat);
    if (!updated.success) {
      res.status(404).json({ error: `Ticket ${sanitizeText(id)} not found` });
      return;
    }
    res.json(updated);
  });

  app.get("/api/kb", async (req, res) => {
    const rawQ = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const q = rawQ ? sanitizeText(rawQ) : "";
    const category = typeof req.query.category === "string" ? req.query.category : undefined;
    const requestedMode = (req.query.mode as RunMode | "auto") ?? "offline";
    const ai = getGeminiClient();
    const mode: RunMode = requestedMode === "gemini" && ai ? "gemini" : "offline";

    let searchResults: Awaited<ReturnType<typeof retrieveKB>> | null = null;
    if (q) {
      searchResults = await retrieveKB(q, category, { mode, ai });
    }

    res.json({
      articles: KB_ARTICLES,
      chunks: KB_CHUNKS,
      thresholds: SIMILARITY_THRESHOLDS,
      search: searchResults,
    });
  });

  app.get("/api/mcp/tools", (_req, res) => {
    res.json({
      serverInfo: {
        name: "spartanassist-helpdesk",
        protocolVersion: "2025-11-25",
        transport: "stdio / http-bridge",
      },
      tools: MCP_TOOLS,
    });
  });

  app.post("/api/mcp/call", (req, res) => {
    try {
      const name = sanitizeText(String(req.body?.name ?? ""));
      const rawArgs =
        req.body?.arguments && typeof req.body.arguments === "object"
          ? (req.body.arguments as Record<string, unknown>)
          : {};
      const args = sanitizeUnknown(rawArgs) as Record<string, unknown>;
      const output = callMcpTool(name, args);
      res.json({ ok: true, tool: name, result: output });
    } catch (err) {
      res.status(400).json({
        ok: false,
        error: sanitizeError(err, "MCP call failed"),
      });
    }
  });

  app.post("/api/validation/run", async (req, res) => {
    try {
      const requestedMode = (req.body?.mode as RunMode | "auto") ?? "offline";
      const ai = getGeminiClient();
      const mode: RunMode =
        requestedMode === "gemini" && ai ? "gemini" : "offline";
      const securityFix = req.body?.securityFix !== false;

      const data = await runValidationSuite({ mode, securityFix });
      res.json(data);
    } catch (err) {
      res.status(500).json({
        error: sanitizeError(err, "Validation run failed"),
      });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), "dist");
    app.use(express.static(distDir));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distDir, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`SpartanAssist server running on http://localhost:${PORT}`);
    const ai = getGeminiClient();
    if (ai) {
      ensureGeminiEmbeddings(ai).catch(() => undefined);
    }
  });
}

startServer();
