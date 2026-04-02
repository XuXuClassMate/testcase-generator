/**
 * Standalone HTTP server
 * ─────────────────────────────────────────────────────────────────────────────
 * Run: node dist/index.js --standalone
 *
 * Endpoints:
 *   POST /api/generate          – generate (supports SSE streaming progress)
 *   POST /api/refine            – refine with user instructions
 *   GET  /api/stages            – get stage definitions + check lists
 *   GET  /api/download/excel/:id
 *   GET  /api/download/markdown/:id
 *   GET  /api/health
 *   GET  /                      – Web UI
 */

import express, { Request, Response, NextFunction } from "express";
import multer from "multer";
import cors from "cors";
import rateLimit from "express-rate-limit";
import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";

import {
  PluginConfig, GenerationResult, ApiResponse,
  Language, TestStage,
  getGeneratorLabel, getReviewerLabels,
} from "./types";
import { TestCaseGenerator } from "./generator";
import { parseBuffer } from "./parser";
import { exportToExcel, exportToMarkdown, exportToXMind } from "./exporter";
import { getAllStages, getStageName, getStageDescription, getStageCheckList } from "./prompts";

// ─── In-memory session store ──────────────────────────────────────────────────

interface Session {
  id: string;
  result: GenerationResult;
  excelPath?: string;
  mdPath?: string;
  xmindPath?: string;
  createdAt: number;
}

const sessions = new Map<string, Session>();

// ─── Server ───────────────────────────────────────────────────────────────────

export async function startServer(cfg: PluginConfig): Promise<void> {
  const app = express();
  const generator = new TestCaseGenerator(cfg);
  const generalLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 300,
    standardHeaders: "draft-7",
    legacyHeaders: false,
  });
  const generationLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    limit: 30,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { success: false, error: "Too many generation requests. Please try again later." },
  });
  const downloadLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 120,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { success: false, error: "Too many download requests. Please try again later." },
  });

  app.use(generalLimiter);
  app.use(cors());
  app.use(express.json({ limit: "50mb" }));

  const publicDir = path.resolve(__dirname, "../public");
  if (fs.existsSync(publicDir)) app.use(express.static(publicDir));

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB (videos need more space)
  });

  // ── Health ─────────────────────────────────────────────────────────────────

  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      provider: getGeneratorLabel(cfg),
      reviewers: getReviewerLabels(cfg),
      language: cfg.language,
      version: "1.0.0",
    });
  });

  // ── Stage info ─────────────────────────────────────────────────────────────

  app.get("/api/stages", (req, res) => {
    const lang = (req.query.lang as Language) ?? cfg.language;
    const stages = getAllStages().map((s) => ({
      id: s,
      name: getStageName(s, lang),
      description: getStageDescription(s, lang),
      checkList: getStageCheckList(s, lang),
    }));
    res.json({ success: true, data: stages });
  });

  // ── Generate (with SSE streaming) ──────────────────────────────────────────

  app.post("/api/generate", generationLimiter, upload.array("files", 20), async (req: Request, res: Response) => {
    const useSSE = req.headers.accept?.includes("text/event-stream");

    if (useSSE) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders();
    }

    const sendEvent = (event: string, data: unknown) => {
      if (useSSE) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const { text, prompt, stage, language, enableReview } = req.body as {
        text?: string;
        prompt?: string;
        stage?: TestStage;
        language?: Language;
        enableReview?: string;
      };
      const files = req.files as Express.Multer.File[] | undefined;

      const contents = [];
      if (text?.trim()) {
        contents.push({ text: text.trim(), images: [] as string[], source: "text-input", inputType: "txt" as const });
      }
      if (files?.length) {
        for (const f of files) {
          sendEvent("progress", { message: `Parsing ${f.originalname}…`, round: 0, score: 0 });
          contents.push(await parseBuffer(f.buffer, f.originalname, f.mimetype));
        }
      }

      if (contents.length === 0) {
        const err: ApiResponse<null> = { success: false, error: "Please provide text or upload files" };
        if (useSSE) { sendEvent("error", err); res.end(); } else res.status(400).json(err);
        return;
      }

      const result = await generator.generate(
        {
          content: contents,
          prompt,
          stage: stage ?? "development",
          language: language ?? cfg.language,
          enableReview: enableReview !== "false",
        },
        (message, round, score) => sendEvent("progress", { message, round, score })
      );

      const sessionId = uuidv4();
      let excelPath: string | undefined;
      let mdPath: string | undefined;
      let xmindPath: string | undefined;
      if (result.testCases.length > 0) {
        excelPath = await exportToExcel(result.testCases, result.testPoints, cfg.outputDir, sessionId, result.language);
        mdPath = exportToMarkdown(result.markdownOutput, cfg.outputDir, sessionId);
      }
      if (result.testPoints.length > 0) {
        xmindPath = await exportToXMind(result.testPoints, cfg.outputDir, result.summary.slice(0, 60) || "Test Map", sessionId, result.language);
      }
      sessions.set(sessionId, { id: sessionId, result, excelPath, mdPath, xmindPath, createdAt: Date.now() });
      pruneOldSessions();

      const payload = { success: true, data: { sessionId, result } };
      if (useSSE) { sendEvent("done", payload); res.end(); } else res.json(payload);

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[standalone] generate error:", err);
      if (useSSE) { sendEvent("error", { success: false, error: msg }); res.end(); }
      else res.status(500).json({ success: false, error: msg });
    }
  });

  // ── Refine ─────────────────────────────────────────────────────────────────

  app.post("/api/refine", generationLimiter, upload.array("files", 20), async (req: Request, res: Response) => {
    const useSSE = req.headers.accept?.includes("text/event-stream");
    if (useSSE) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders();
    }
    const sendEvent = (event: string, data: unknown) => {
      if (useSSE) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const { sessionId, editInstructions, prompt, text, stage, language, enableReview } = req.body as {
        sessionId: string; editInstructions?: string; prompt?: string; text?: string;
        stage?: TestStage; language?: Language; enableReview?: string;
      };
      const files = req.files as Express.Multer.File[] | undefined;

      const session = sessions.get(sessionId);
      if (!session) {
        const err = { success: false, error: "Session not found. Please generate first." };
        if (useSSE) { sendEvent("error", err); res.end(); } else res.status(404).json(err);
        return;
      }

      const contents = [];
      if (text?.trim()) {
        contents.push({ text: text.trim(), images: [] as string[], source: "text-input", inputType: "txt" as const });
      }
      if (files?.length) {
        for (const f of files) contents.push(await parseBuffer(f.buffer, f.originalname, f.mimetype));
      }
      if (contents.length === 0) {
        contents.push({ text: session.result.summary, images: [], source: "session", inputType: "txt" as const });
      }

      const result = await generator.refine(
        { content: contents, prompt, stage: stage ?? session.result.stage, language: language ?? session.result.language, enableReview: enableReview !== "false" },
        session.result,
        editInstructions ?? "",
        (message, round, score) => sendEvent("progress", { message, round, score })
      );

      const newId = uuidv4();
      let excelPath: string | undefined;
      let mdPath: string | undefined;
      let xmindPath: string | undefined;
      if (result.testCases.length > 0) {
        excelPath = await exportToExcel(result.testCases, result.testPoints, cfg.outputDir, newId, result.language);
        mdPath = exportToMarkdown(result.markdownOutput, cfg.outputDir, newId);
      }
      if (result.testPoints.length > 0) {
        xmindPath = await exportToXMind(result.testPoints, cfg.outputDir, result.summary.slice(0, 60) || "Test Map", newId, result.language);
      }
      sessions.set(newId, { id: newId, result, excelPath, mdPath, xmindPath, createdAt: Date.now() });
      pruneOldSessions();

      const payload = { success: true, data: { sessionId: newId, result } };
      if (useSSE) { sendEvent("done", payload); res.end(); } else res.json(payload);

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (useSSE) { sendEvent("error", { success: false, error: msg }); res.end(); }
      else res.status(500).json({ success: false, error: msg });
    }
  });

  // ── Downloads ──────────────────────────────────────────────────────────────

  app.get("/api/download/excel/:id", downloadLimiter, (req, res) => {
    const s = sessions.get(req.params.id);
    if (!s?.excelPath || !fs.existsSync(s.excelPath)) {
      res.status(404).json({ success: false, error: "File not found" }); return;
    }
    res.download(s.excelPath, "test-cases.xlsx");
  });

  app.get("/api/download/markdown/:id", downloadLimiter, (req, res) => {
    const s = sessions.get(req.params.id);
    if (!s?.mdPath || !fs.existsSync(s.mdPath)) {
      res.status(404).json({ success: false, error: "File not found" }); return;
    }
    res.download(s.mdPath, "test-cases.md");
  });

  app.get("/api/download/xmind/:id", downloadLimiter, (req, res) => {
    const s = sessions.get(req.params.id);
    if (!s?.xmindPath || !fs.existsSync(s.xmindPath)) {
      res.status(404).json({ success: false, error: "XMind file not found" }); return;
    }
    res.download(s.xmindPath, "test-mindmap.xmind");
  });

  // ── SPA fallback ───────────────────────────────────────────────────────────

  app.get("*", (_req, res) => {
    const idx = path.join(publicDir, "index.html");
    if (fs.existsSync(idx)) res.sendFile(idx);
    else res.send("TestCase Generator v1.0.0 — standalone mode. API at /api/generate");
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  });

  app.listen(cfg.standalonePort, () => {
    console.log(`\nAI TestCase Generator v1.0.0 (Standalone)`);
    console.log(`   → http://localhost:${cfg.standalonePort}`);
    console.log(`   → Generator: ${getGeneratorLabel(cfg)}`);
    console.log(`   → Reviewers: ${getReviewerLabels(cfg).join(", ") || "none"}`);
    console.log(`   → Language:  ${cfg.language}`);
    console.log(`   → Review loop: ${cfg.enableReviewLoop ? `on (threshold ${cfg.reviewScoreThreshold}, max ${cfg.maxReviewRounds} rounds)` : "off"}`);
    console.log(`   → Output: ${cfg.outputDir}\n`);
  });
}

function pruneOldSessions() {
  if (sessions.size > 100) {
    const sorted = [...sessions.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt);
    sorted.slice(0, 20).forEach(([k]) => sessions.delete(k));
  }
}
