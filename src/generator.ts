/**
 * Core AI generation logic
 * - Bilingual output (zh / en, default en)
 * - Stage-aware prompts (requirement / development / prerelease)
 * - Multi-model review loop integration
 */

import { AIAdapter } from "./ai-adapter";
import { mergeContents } from "./parser";
import { getStageSystemAddendum, getStageName } from "./prompts";
import { MultiModelReviewer } from "./reviewer";
import {
  GenerateRequest,
  GenerationResult,
  Language,
  PluginConfig,
  TestCase,
  TestPoint,
  TestStage,
  getGeneratorModel,
  getReviewerCapableModels,
} from "./types";

// ─── Build language-aware system prompt ───────────────────────────────────────

function buildSystemPrompt(lang: Language, stage: TestStage): string {
  const stageAddendum = getStageSystemAddendum(stage, lang);

  if (lang === "zh") {
    return `你是一名资深软件测试工程师，专注于从需求文档自动生成高质量测试用例。

你的输出必须严格遵循 JSON 格式，不能包含任何额外的解释文字、markdown 代码块标记。

测试用例优先级：
- P0：核心功能、主流程（必须覆盖）
- P1：重要功能、常见场景
- P2：边界条件、异常流程
- P3：兼容性、性能、安全扩展场景

测试类型：功能测试 | 边界测试 | 异常测试 | 性能测试 | 兼容性测试 | 安全测试 | 易用性测试 | 回归测试 | 冒烟测试
自动化字段：是 | 否 | 待定
${stageAddendum}

输出格式（严格 JSON，无任何前缀后缀）：
{
  "summary": "需求的简短摘要（1-2句）",
  "testPoints": [
    { "module": "模块", "feature": "功能点", "description": "测试要点", "priority": "P0" }
  ],
  "testCases": [
    {
      "id": "TC-001",
      "module": "模块",
      "feature": "功能点",
      "title": "测试用例标题",
      "preconditions": "前置条件",
      "steps": ["步骤1", "步骤2"],
      "expectedResult": "预期结果",
      "priority": "P0",
      "type": "功能测试",
      "automated": "是"
    }
  ]
}

要求：
1. 用例ID从TC-001递增
2. 步骤具体可操作，不超过8步
3. 每个模块至少1条P0用例
4. 覆盖正常、边界、异常三类场景
5. 如输入含图片，结合UI元素生成用例`;
  }

  return `You are a senior software test engineer specializing in generating high-quality test cases from requirements.

Output ONLY valid JSON — no markdown fences, no explanations, no preamble.

Priority definitions:
- P0: Core features / critical paths (mandatory coverage)
- P1: Important features / common scenarios
- P2: Boundary conditions / error flows
- P3: Compatibility / performance / security extensions

Case types: Functional | Boundary | Exception | Performance | Compatibility | Security | Usability | Regression | Smoke
Automated field: Yes | No | TBD
${stageAddendum}

Output format (strict JSON):
{
  "summary": "Brief 1-2 sentence summary",
  "testPoints": [
    { "module": "Module", "feature": "Feature", "description": "Test point", "priority": "P0" }
  ],
  "testCases": [
    {
      "id": "TC-001",
      "module": "Module",
      "feature": "Feature",
      "title": "Test case title",
      "preconditions": "Preconditions",
      "steps": ["Step 1", "Step 2"],
      "expectedResult": "Expected outcome",
      "priority": "P0",
      "type": "Functional",
      "automated": "Yes"
    }
  ]
}

Rules:
1. IDs increment from TC-001
2. Steps are specific and actionable, max 8 per case
3. At least 1 P0 case per module
4. Cover happy path, boundary, and error scenarios
5. If images included, incorporate visible UI elements`;
}

// ─── Generator ────────────────────────────────────────────────────────────────

export class TestCaseGenerator {
  private config: PluginConfig;
  private adapter: AIAdapter;
  private reviewer: MultiModelReviewer;

  constructor(config: PluginConfig) {
    this.config = config;
    this.adapter = new AIAdapter(getGeneratorModel(config));
    this.reviewer = new MultiModelReviewer(config);
  }

  async generate(
    req: GenerateRequest,
    onProgress?: (msg: string, round: number, score: number) => void
  ): Promise<GenerationResult> {
    const lang = req.language ?? this.config.language;
    const stage = req.stage ?? "development";

    const mergedText = mergeContents(req.content);
    const allImages = req.content.flatMap((c) => c.images);
    const hasImages = allImages.length > 0;

    const userPrompt = buildUserPrompt(mergedText, req.prompt, lang, stage);
    const systemPrompt = buildSystemPrompt(lang, stage);

    onProgress?.("Generating test cases…", 0, 0);

    const messages = hasImages
      ? [{
          role: "user" as const,
          content: [
            { type: "text" as const, text: userPrompt },
            ...allImages.map((img) => ({
              type: "image_url" as const,
              image_url: { url: img },
            })),
          ],
        }]
      : [{ role: "user" as const, content: userPrompt }];

    const raw = await this.adapter.complete(systemPrompt, messages);
    const parsed = parseAIResponse(raw);

    const initial: GenerationResult = {
      ...parsed,
      markdownOutput: buildMarkdown(parsed.testPoints, parsed.testCases, parsed.summary, lang),
      language: lang,
      stage,
    };

    const enableReview = req.enableReview ?? this.config.enableReviewLoop;
    const hasReviewers = getReviewerCapableModels(this.config).length > 0;
    if (!enableReview || !hasReviewers) return initial;

    onProgress?.("Starting multi-model review loop…", 0, 0);
    return this.reviewer.runReviewLoop(initial, mergedText, onProgress);
  }

  async refine(
    req: GenerateRequest,
    previousResult: GenerationResult,
    editInstructions: string,
    onProgress?: (msg: string, round: number, score: number) => void
  ): Promise<GenerationResult> {
    const lang = req.language ?? previousResult.language;
    const stage = req.stage ?? previousResult.stage;
    const mergedText = mergeContents(req.content);

    const basePrompt = buildUserPrompt(mergedText, req.prompt, lang, stage);
    const refineSuffix = lang === "zh"
      ? `\n\n---\n之前的摘要：${previousResult.summary}\n\n用户修改要求：${editInstructions}\n\n请重新生成完整JSON。`
      : `\n\n---\nPrevious summary: ${previousResult.summary}\n\nUser modification request: ${editInstructions}\n\nRegenerate the complete JSON.`;

    const raw = await this.adapter.complete(buildSystemPrompt(lang, stage), [
      { role: "user", content: basePrompt + refineSuffix },
    ]);
    const parsed = parseAIResponse(raw);
    const refined: GenerationResult = {
      ...parsed,
      markdownOutput: buildMarkdown(parsed.testPoints, parsed.testCases, parsed.summary, lang),
      language: lang,
      stage,
    };

    const enableReview = req.enableReview ?? this.config.enableReviewLoop;
    if (!enableReview || getReviewerCapableModels(this.config).length === 0) return refined;
    return this.reviewer.runReviewLoop(refined, mergedText, onProgress);
  }
}

// ─── Helpers (exported — used by reviewer.ts) ─────────────────────────────────

function buildUserPrompt(text: string, hint: string | undefined, lang: Language, stage: TestStage): string {
  const stageName = getStageName(stage, lang);
  const prefix = lang === "zh"
    ? `【测试阶段：${stageName}】\n\n请根据以下需求文档生成测试点和测试用例：`
    : `[Testing Stage: ${stageName}]\n\nGenerate test points and test cases for:`;
  const hintLine = hint?.trim()
    ? lang === "zh" ? `\n\n---\n补充说明：${hint.trim()}` : `\n\n---\nAdditional notes: ${hint.trim()}`
    : "";
  return `${prefix}\n\n${text}${hintLine}`;
}

function parseAIResponse(raw: string): Omit<GenerationResult, "markdownOutput" | "language" | "stage"> {
  const json = raw.trim().replace(/^```[a-z]*\n?/i, "").replace(/```$/, "").trim();
  try {
    const data = JSON.parse(json) as {
      summary?: string; testPoints?: TestPoint[]; testCases?: TestCase[];
    };
    return {
      summary: data.summary ?? "",
      testPoints: data.testPoints ?? [],
      testCases: data.testCases ?? [],
    };
  } catch {
    console.error("[generator] JSON parse failed:", json.slice(0, 200));
    return { summary: "AI response parse error — please retry", testPoints: [], testCases: [] };
  }
}

export function buildMarkdown(
  testPoints: TestPoint[],
  testCases: TestCase[],
  summary: string,
  lang: Language = "en"
): string {
  const zh = lang === "zh";
  const T = {
    title: zh ? "测试用例报告" : "Test Case Report",
    points: zh ? "一、测试点清单" : "I. Test Points",
    cases: zh ? "二、详细测试用例" : "II. Detailed Test Cases",
    feature: zh ? "功能点" : "Feature",
    priority: zh ? "优先级" : "Priority",
    type: zh ? "类型" : "Type",
    automated: zh ? "自动化" : "Automated",
    preconditions: zh ? "前置条件" : "Preconditions",
    steps: zh ? "测试步骤" : "Steps",
    expected: zh ? "预期结果" : "Expected Result",
  };

  const lines: string[] = [`# ${T.title}`, "", `> ${summary}`, "", "---", "", `## ${T.points}`, ""];

  const pointsByMod = groupBy(testPoints, (p) => p.module);
  for (const [mod, pts] of Object.entries(pointsByMod)) {
    lines.push(`### ${mod}`, "");
    for (const p of pts) lines.push(`- **[${p.priority}]** \`${p.feature}\` — ${p.description}`);
    lines.push("");
  }

  lines.push("---", "", `## ${T.cases}`, "");

  const casesByMod = groupBy(testCases, (c) => c.module);
  for (const [mod, cases] of Object.entries(casesByMod)) {
    lines.push(`### ${mod}`, "");
    for (const tc of cases) {
      lines.push(
        `#### ${tc.id} — ${tc.title}`, "",
        `| ${T.feature} | ${T.priority} | ${T.type} | ${T.automated} |`,
        `| --- | --- | --- | --- |`,
        `| ${tc.feature} | ${tc.priority} | ${tc.type} | ${tc.automated} |`, "",
        `**${T.preconditions}:** ${tc.preconditions}`, "",
        `**${T.steps}:**`, ""
      );
      tc.steps.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
      lines.push("", `**${T.expected}:** ${tc.expectedResult}`, "");
    }
  }
  return lines.join("\n");
}

function groupBy<T>(arr: T[], key: (item: T) => string): Record<string, T[]> {
  return arr.reduce((acc, item) => {
    const k = key(item);
    if (!acc[k]) acc[k] = [];
    acc[k].push(item);
    return acc;
  }, {} as Record<string, T[]>);
}
