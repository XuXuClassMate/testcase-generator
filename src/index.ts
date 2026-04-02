#!/usr/bin/env node
/**
 * OpenClaw Plugin Entry Point
 *
 * Dual-mode:
 *   As OpenClaw plugin → loaded by gateway via `register(api)`
 *   Standalone mode   → `node dist/index.js --standalone`
 */

import path from "path";
import {
  DEFAULT_CONFIG,
  PluginConfig,
  ModelEntry,
  AIVendor,
  getGeneratorLabel,
  getReviewerLabels,
} from "./types";
import { TestCaseGenerator } from "./generator";
import { parseBuffer, parseFile } from "./parser";
import { exportToExcel, exportToMarkdown, exportToXMind } from "./exporter";

// ─── OpenClaw Plugin API shim ──────────────────────────────────────────────────
interface OpenClawPluginApi {
  config: Record<string, unknown>;
  registerTool(tool: ToolDefinition): void;
  registerCommand(cmd: CommandDefinition): void;
  log: { info: (...a: unknown[]) => void; error: (...a: unknown[]) => void };
}
interface ToolDefinition {
  name: string; description: string; input: Record<string, unknown>;
  execute: (args: Record<string, unknown>, ctx: ToolContext) => Promise<string>;
}
interface ToolContext { workspaceDir?: string; }
interface CommandDefinition {
  name: string; description: string; args?: string;
  execute: (args: string[], ctx: CommandContext) => Promise<string>;
}
interface CommandContext { reply: (msg: string) => Promise<void>; workspaceDir?: string; }

// ─── Plugin register ───────────────────────────────────────────────────────────

export async function register(api: OpenClawPluginApi): Promise<void> {
  const cfg = resolveConfig(api.config);

  try {
    api.log.info(`[testcase-generator] Loaded. Generator: ${getGeneratorLabel(cfg)}`);
    api.log.info(`[testcase-generator] Reviewers: ${getReviewerLabels(cfg).join(", ") || "none"}`);
  } catch (e) {
    api.log.error("[testcase-generator] Config error:", e);
  }

  const generator = new TestCaseGenerator(cfg);

  // ── Tool: generate_test_cases ────────────────────────────────────────────────

  api.registerTool({
    name: "generate_test_cases",
    description: "Generate high-quality test cases from requirement text or file. Returns Markdown report, saves Excel + XMind files.",
    input: {
      type: "object",
      properties: {
        text:          { type: "string",  description: "Requirement text (or use file_path)" },
        file_path:     { type: "string",  description: "Path to PDF/DOCX/TXT/image/video file" },
        prompt:        { type: "string",  description: "Custom focus hint, e.g. 'focus on security'" },
        stage:         { type: "string",  description: "requirement | development | prerelease" },
        language:      { type: "string",  description: "en | zh" },
        output_excel:  { type: "boolean", description: "Save Excel file (default true)" },
        output_xmind:  { type: "boolean", description: "Save XMind mind map (default true)" },
        enable_review: { type: "boolean", description: "Run multi-model review loop (default true)" },
      },
    },
    execute: async (args, ctx) => {
      const text      = args.text as string | undefined;
      const filePath  = args.file_path as string | undefined;
      const prompt    = args.prompt as string | undefined;
      const stage     = (args.stage as "requirement" | "development" | "prerelease") ?? "development";
      const language  = (args.language as "en" | "zh") ?? cfg.language;
      const doExcel   = args.output_excel !== false;
      const doXMind   = args.output_xmind !== false;
      const doReview  = args.enable_review !== false;

      if (!text && !filePath) return "❌ Please provide `text` or `file_path`";

      const content = filePath
        ? [await parseFile(filePath)]
        : [{ text: text!, images: [], source: "inline", inputType: "txt" as const }];

      const result = await generator.generate({ content, prompt, stage, language, enableReview: doReview });
      const outputDir = ctx.workspaceDir ? path.join(ctx.workspaceDir, "testcase-output") : cfg.outputDir;

      const files: string[] = [];
      if (doExcel && result.testCases.length > 0) {
        const excelPath = await exportToExcel(result.testCases, result.testPoints, outputDir, "test-cases", language);
        files.push("Excel: `" + excelPath + "`");
      }
      if (doXMind && result.testPoints.length > 0) {
        const xp = await exportToXMind(result.testPoints, outputDir, result.summary.slice(0, 60), "mindmap", language);
        files.push("XMind: `" + xp + "`");
      }

      const suffix = files.length
        ? `\n\n---\n📁 **Files saved:**\n${files.map(f => "- " + f).join("\n")}`
        : "";
      return result.markdownOutput + suffix;
    },
  });

  // ── Command: /testgen ─────────────────────────────────────────────────────────

  api.registerCommand({
    name: "testgen",
    description: "AI test case generator",
    args: "<requirement text | file path> [--prompt <hint>] [--stage requirement|development|prerelease] [--lang en|zh] [--no-review]",
    execute: async (args, ctx) => {
      if (args.length === 0) {
        await ctx.reply(
          "Usage: `/testgen <requirement>` or `/testgen <file.pdf> [--prompt hint]`\n\n" +
          "Flags:\n" +
          "  `--prompt <text>`   Custom focus hint\n" +
          "  `--stage <stage>`   requirement | development | prerelease\n" +
          "  `--lang <lang>`     en | zh\n" +
          "  `--no-review`       Skip review loop\n\n" +
          "Examples:\n" +
          "• `/testgen User login with phone+password, OAuth, 5-attempt lockout`\n" +
          "• `/testgen /path/req.pdf --stage prerelease --lang zh`"
        );
        return "";
      }

      // Parse flags
      let inputArgs = [...args];
      const extract = (flag: string) => {
        const i = inputArgs.indexOf(flag);
        if (i === -1) return undefined;
        const val = inputArgs[i + 1];
        inputArgs.splice(i, 2);
        return val;
      };
      const hasFlag = (flag: string) => {
        const i = inputArgs.indexOf(flag);
        if (i !== -1) { inputArgs.splice(i, 1); return true; }
        return false;
      };

      const prompt   = extract("--prompt");
      const stage    = (extract("--stage") ?? "development") as "requirement" | "development" | "prerelease";
      const language = (extract("--lang") ?? cfg.language) as "en" | "zh";
      const noReview = hasFlag("--no-review");
      const input    = inputArgs.join(" ");

      await ctx.reply("⏳ Generating test cases…");

      const looksLikePath = /^[./~]/.test(input) || /\.[a-z]{2,4}$/i.test(input);
      let content;
      if (looksLikePath) {
        try { content = [await parseFile(input)]; }
        catch { await ctx.reply(`❌ Cannot read file: ${input}`); return ""; }
      } else {
        content = [{ text: input, images: [], source: "chat", inputType: "txt" as const }];
      }

      const result = await generator.generate({ content, prompt, stage, language, enableReview: !noReview });
      const outputDir = ctx.workspaceDir ? path.join(ctx.workspaceDir, "testcase-output") : cfg.outputDir;

      const xlsxPath  = await exportToExcel(result.testCases, result.testPoints, outputDir, "test-cases", language);
      const xmindPath = await exportToXMind(result.testPoints, outputDir, result.summary.slice(0, 60), "mindmap", language);
      const mdPath    = exportToMarkdown(result.markdownOutput, outputDir);

      const scoreNote = result.finalScore ? `\n📊 **Quality Score:** ${result.finalScore}/100` : "";
      await ctx.reply(
        result.markdownOutput +
        scoreNote +
        `\n\n---\n📁 **Files:**\n- Excel: \`${xlsxPath}\`\n- XMind: \`${xmindPath}\`\n- Markdown: \`${mdPath}\``
      );
      return result.markdownOutput;
    },
  });
}

// ─── Config resolver ───────────────────────────────────────────────────────────

function resolveConfig(raw: Record<string, unknown>): PluginConfig {
  const models = resolveModels(raw);
  return {
    ...DEFAULT_CONFIG,
    models,
    language:             (raw.language as "en" | "zh") ?? DEFAULT_CONFIG.language,
    enableReviewLoop:     (raw.enableReviewLoop as boolean) ?? DEFAULT_CONFIG.enableReviewLoop,
    reviewScoreThreshold: (raw.reviewScoreThreshold as number) ?? DEFAULT_CONFIG.reviewScoreThreshold,
    maxReviewRounds:      (raw.maxReviewRounds as number) ?? DEFAULT_CONFIG.maxReviewRounds,
    standalonePort:       (raw.standalonePort as number) ?? DEFAULT_CONFIG.standalonePort,
    outputDir:            (raw.outputDir as string) ?? DEFAULT_CONFIG.outputDir,
  };
}

function resolveModels(raw: Record<string, unknown>): ModelEntry[] {
  if (Array.isArray(raw.models) && raw.models.length > 0) {
    return raw.models as ModelEntry[];
  }
  // Legacy env-var fallback for standalone mode
  const entries: ModelEntry[] = [];
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey    = process.env.OPENAI_API_KEY;
  const deepseekKey  = process.env.DEEPSEEK_API_KEY;
  const provider = (process.env.AI_PROVIDER ?? "anthropic") as string;

  if (anthropicKey) entries.push({ id: "claude-env", vendor: "anthropic", model: "claude-opus-4-5", apiKey: anthropicKey, role: "both" });
  if (openaiKey)    entries.push({ id: "openai-env",  vendor: "openai",    model: "gpt-4o",          apiKey: openaiKey,    role: "reviewer" });
  if (deepseekKey)  entries.push({ id: "deepseek-env",vendor: "deepseek",  model: "deepseek-chat",   apiKey: deepseekKey,  role: "reviewer" });

  if (entries.length === 0) {
    throw new Error(
      "No models configured. Add models[] to plugin config, or set ANTHROPIC_API_KEY / OPENAI_API_KEY env vars.\n" +
      "See README § Model Configuration for details."
    );
  }

  // Ensure first entry is generator if primary provider is not anthropic
  if (provider !== "claude" && provider !== "anthropic") {
    const preferred = entries.find(e => e.vendor === provider as AIVendor);
    if (preferred) preferred.role = "both";
  }

  return entries;
}

// ─── Standalone mode ───────────────────────────────────────────────────────────

export async function runStandalone(): Promise<void> {
  const { startServer } = await import("./standalone");
  const models = resolveModels({});
  const cfg: PluginConfig = {
    ...DEFAULT_CONFIG,
    models,
    language:             (process.env.LANGUAGE ?? "en") as "en" | "zh",
    enableReviewLoop:     process.env.ENABLE_REVIEW !== "false",
    reviewScoreThreshold: process.env.REVIEW_THRESHOLD ? parseInt(process.env.REVIEW_THRESHOLD, 10) : 90,
    maxReviewRounds:      process.env.MAX_REVIEW_ROUNDS ? parseInt(process.env.MAX_REVIEW_ROUNDS, 10) : 5,
    standalonePort:       process.env.PORT ? parseInt(process.env.PORT, 10) : 3456,
    outputDir:            process.env.OUTPUT_DIR ?? "./testcase-output",
  };
  await startServer(cfg);
}

if (require.main === module) {
  if (process.argv.includes("--standalone")) {
    runStandalone().catch(console.error);
  } else {
    console.error("Usage: testcase-generator --standalone");
    process.exitCode = 1;
  }
}

export default { register };
