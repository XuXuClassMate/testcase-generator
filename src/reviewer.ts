/**
 * Multi-model review loop with 3 fixed reviewer personas 🔥
 *
 * Personas (always exactly 3, regardless of model count):
 *   1. Test Manager    — coverage, executability, automation
 *   2. Dev Manager     — API/integration tests, security, technical boundaries
 *   3. Product Manager — business logic, UX flows, requirements alignment
 *
 * Flow: Generate → [Review×3 personas] → Aggregate → Refine → repeat
 * Stop when: score ≥ threshold  OR  no new issues  OR  max rounds reached
 */

import { AIAdapter } from "./ai-adapter";
import {
  GenerationResult,
  Language,
  ModelEntry,
  PluginConfig,
  ReviewComment,
  ReviewRound,
  ReviewScores,
  ReviewerPersonaConfig,
  REVIEWER_PERSONAS,
  TestCase,
  TestPoint,
  getReviewerModels,
  getGeneratorModel,
} from "./types";

// ─── Review system prompt builder ─────────────────────────────────────────────

function buildReviewPrompt(persona: ReviewerPersonaConfig, lang: Language): string {
  const personaAddendum = persona.systemAddendum[lang];
  const scoreDefs = lang === "zh"
    ? `评分维度（总分100）：
- coverage（覆盖率）：满分30分。主流程(10) + 所有异常分支(10) + 边界值(10)
- logicIntegrity（逻辑完整性）：满分20分。步骤顺序合理(10) + 前置条件完整(10)
- executability（可执行性）：满分20分。步骤具体可操作(10) + 预期结果可验证(10)
- clarity（清晰度）：满分15分。标题简洁准确(5) + 步骤描述无歧义(10)
- security（安全性）：满分15分。权限测试(5) + 注入/XSS安全(5) + 异常处理(5)`
    : `Scoring dimensions (100 pts total):
- coverage (30 pts): happy paths(10) + error branches(10) + boundary values(10)
- logicIntegrity (20 pts): logical step order(10) + complete preconditions(10)
- executability (20 pts): actionable steps(10) + verifiable expected results(10)
- clarity (15 pts): concise titles(5) + unambiguous step descriptions(10)
- security (15 pts): permission tests(5) + injection/XSS security(5) + error handling(5)`;

  const outputSpec = lang === "zh"
    ? `输出严格 JSON，不要有任何额外文字：
{
  "scores": { "coverage": 0-30, "logicIntegrity": 0-20, "executability": 0-20, "clarity": 0-15, "security": 0-15 },
  "issues": ["问题描述1", "问题描述2"],
  "suggestions": ["优化建议1", "优化建议2"],
  "approved": true或false
}`
    : `Output ONLY strict JSON, no extra text:
{
  "scores": { "coverage": 0-30, "logicIntegrity": 0-20, "executability": 0-20, "clarity": 0-15, "security": 0-15 },
  "issues": ["issue description 1", "issue description 2"],
  "suggestions": ["suggestion 1", "suggestion 2"],
  "approved": true or false
}`;

  return [personaAddendum, "", scoreDefs, "", outputSpec].join("\n");
}

// ─── Refine system prompt ──────────────────────────────────────────────────────

const REFINE_SYSTEM: Record<Language, string> = {
  zh: `你是资深软件测试工程师，根据测试经理、开发经理、产品经理的联合评审意见优化测试用例。
优化要求：补充遗漏场景、完善步骤可执行性、修正逻辑问题、增加安全和边界用例。
输出格式与初始生成完全相同（严格 JSON）：{ "summary": "...", "testPoints": [...], "testCases": [...] }`,
  en: `You are a senior test engineer. Refine the test cases based on joint review feedback from Test Manager, Dev Manager, and Product Manager.
Improvements: add missing scenarios, improve step executability, fix logic issues, add security/boundary cases.
Output the SAME JSON format: { "summary": "...", "testPoints": [...], "testCases": [...] }`,
};

// ─── Reviewer class ────────────────────────────────────────────────────────────

export class MultiModelReviewer {
  private config: PluginConfig;
  private generatorAdapter: AIAdapter;

  constructor(config: PluginConfig) {
    this.config = config;
    this.generatorAdapter = new AIAdapter(getGeneratorModel(config));
  }

  async runReviewLoop(
    initial: GenerationResult,
    requirementText: string,
    onProgress?: (msg: string, round: number, score: number) => void
  ): Promise<GenerationResult> {
    const lang = initial.language;
    const { maxReviewRounds, reviewScoreThreshold } = this.config;
    const reviewerSlots = getReviewerModels(this.config);

    let current = initial;
    const allRounds: ReviewRound[] = [];
    let prevIssueKeys = new Set<string>();

    for (let round = 1; round <= maxReviewRounds; round++) {
      const personaNames = reviewerSlots.map((s) => s.persona.name[lang]).join(" · ");
      onProgress?.(`Round ${round}: reviewing by ${personaNames}…`, round, 0);

      // ── Each persona reviews independently ────────────────────────────────
      const comments: ReviewComment[] = [];
      for (const slot of reviewerSlots) {
        try {
          const comment = await this.reviewByPersona(
            slot.model,
            slot.persona,
            current.testCases,
            current.testPoints,
            requirementText,
            lang
          );
          comments.push(comment);
          onProgress?.(
            `  ${slot.persona.name[lang]}: ${comment.scores.total}/100`,
            round,
            comment.scores.total
          );
        } catch (err) {
          console.warn(`[reviewer] ${slot.persona.id} (${slot.model.id}) failed:`, err);
        }
      }

      if (comments.length === 0) break;

      // ── Aggregate ─────────────────────────────────────────────────────────
      const agg = aggregate(comments);
      onProgress?.(
        `Round ${round} aggregate score: ${agg.score}/100 · ${agg.issues.length} issues`,
        round,
        agg.score
      );

      allRounds.push({
        round,
        comments,
        aggregatedScore: agg.score,
        aggregatedIssues: agg.issues,
        passed: agg.score >= reviewScoreThreshold,
      });

      // ── Termination ───────────────────────────────────────────────────────
      if (agg.score >= reviewScoreThreshold) {
        onProgress?.(`✅ Score ${agg.score} ≥ threshold ${reviewScoreThreshold}. Review passed!`, round, agg.score);
        break;
      }
      const newIssueKeys = new Set(agg.issues.map((i) => i.slice(0, 40).toLowerCase()));
      const hasNew = [...newIssueKeys].some((k) => !prevIssueKeys.has(k));
      if (!hasNew && round > 1) {
        onProgress?.(`No new issues in round ${round}. Stopping.`, round, agg.score);
        break;
      }
      if (round === maxReviewRounds) {
        onProgress?.(`Max rounds (${maxReviewRounds}) reached.`, round, agg.score);
        break;
      }
      prevIssueKeys = newIssueKeys;

      // ── Refine ────────────────────────────────────────────────────────────
      onProgress?.(`Refining based on feedback from all 3 reviewers…`, round, agg.score);
      current = await this.refine(current, agg.issues, agg.suggestions, lang);
    }

    const finalScore = allRounds.length > 0
      ? allRounds[allRounds.length - 1].aggregatedScore
      : 0;

    return { ...current, reviewRounds: allRounds, finalScore };
  }

  // ── Single persona review ──────────────────────────────────────────────────

  private async reviewByPersona(
    modelEntry: ModelEntry,
    persona: ReviewerPersonaConfig,
    testCases: TestCase[],
    testPoints: TestPoint[],
    requirementText: string,
    lang: Language
  ): Promise<ReviewComment> {
    const adapter = new AIAdapter(modelEntry);
    const systemPrompt = buildReviewPrompt(persona, lang);

    const userContent = lang === "zh"
      ? `【评审角色：${persona.name.zh}】\n\n需求文档：\n${requirementText}\n\n---\n测试点（${testPoints.length}个）：\n${JSON.stringify(testPoints, null, 2)}\n\n---\n测试用例（${testCases.length}条）：\n${JSON.stringify(testCases, null, 2)}`
      : `[Reviewer Role: ${persona.name.en}]\n\nRequirement:\n${requirementText}\n\n---\nTest Points (${testPoints.length}):\n${JSON.stringify(testPoints, null, 2)}\n\n---\nTest Cases (${testCases.length}):\n${JSON.stringify(testCases, null, 2)}`;

    const raw = await adapter.complete(systemPrompt, [{ role: "user", content: userContent }]);
    return parseReviewResponse(raw, modelEntry, persona);
  }

  // ── Refine step ────────────────────────────────────────────────────────────

  private async refine(
    current: GenerationResult,
    issues: string[],
    suggestions: string[],
    lang: Language
  ): Promise<GenerationResult> {
    const userContent = lang === "zh"
      ? `当前测试用例：\n${JSON.stringify({ testPoints: current.testPoints, testCases: current.testCases }, null, 2)}\n\n三位评审人发现的问题：\n${issues.map((i, n) => `${n + 1}. ${i}`).join("\n")}\n\n优化建议：\n${suggestions.map((s, n) => `${n + 1}. ${s}`).join("\n")}\n\n请根据以上意见输出完整优化后的JSON。`
      : `Current test cases:\n${JSON.stringify({ testPoints: current.testPoints, testCases: current.testCases }, null, 2)}\n\nIssues from 3 reviewers:\n${issues.map((i, n) => `${n + 1}. ${i}`).join("\n")}\n\nSuggestions:\n${suggestions.map((s, n) => `${n + 1}. ${s}`).join("\n")}\n\nOutput the complete refined JSON.`;

    const raw = await this.generatorAdapter.complete(REFINE_SYSTEM[lang], [
      { role: "user", content: userContent },
    ]);

    return parseRefinedResult(raw, current, lang);
  }
}

// ─── Parse helpers ─────────────────────────────────────────────────────────────

function parseReviewResponse(raw: string, entry: ModelEntry, persona: ReviewerPersonaConfig): ReviewComment {
  const json = raw.trim().replace(/^```[a-z]*\n?/i, "").replace(/```$/, "").trim();
  try {
    const d = JSON.parse(json) as {
      scores: { coverage: number; logicIntegrity: number; executability: number; clarity: number; security: number };
      issues: string[];
      suggestions: string[];
      approved: boolean;
    };
    const scores: ReviewScores = {
      coverage:       clamp(d.scores?.coverage ?? 0, 0, 30),
      logicIntegrity: clamp(d.scores?.logicIntegrity ?? 0, 0, 20),
      executability:  clamp(d.scores?.executability ?? 0, 0, 20),
      clarity:        clamp(d.scores?.clarity ?? 0, 0, 15),
      security:       clamp(d.scores?.security ?? 0, 0, 15),
      total: 0,
    };
    scores.total = scores.coverage + scores.logicIntegrity + scores.executability + scores.clarity + scores.security;
    return {
      modelId: entry.id,
      vendor: entry.vendor,
      persona: persona.id,
      personaName: `${persona.name.en} (${entry.label || entry.model || entry.id})`,
      scores,
      issues: d.issues ?? [],
      suggestions: d.suggestions ?? [],
      approved: d.approved ?? scores.total >= 90,
    };
  } catch {
    return {
      modelId: entry.id,
      vendor: entry.vendor,
      persona: persona.id,
      personaName: persona.name.en,
      scores: { coverage: 15, logicIntegrity: 10, executability: 10, clarity: 8, security: 7, total: 50 },
      issues: ["Review response parse failed"],
      suggestions: [],
      approved: false,
    };
  }
}

function aggregate(comments: ReviewComment[]) {
  const score = Math.round(comments.reduce((s, c) => s + c.scores.total, 0) / comments.length);
  const seen = new Set<string>();
  const issues: string[] = [];
  const suggestions: string[] = [];
  for (const c of comments) {
    for (const x of c.issues) {
      const k = x.slice(0, 40).toLowerCase();
      if (!seen.has(k)) { seen.add(k); issues.push(x); }
    }
  }
  const seenS = new Set<string>();
  for (const c of comments) {
    for (const x of c.suggestions) {
      const k = x.slice(0, 40).toLowerCase();
      if (!seenS.has(k)) { seenS.add(k); suggestions.push(x); }
    }
  }
  return { score, issues, suggestions };
}

function parseRefinedResult(raw: string, fallback: GenerationResult, lang: Language): GenerationResult {
  const json = raw.trim().replace(/^```[a-z]*\n?/i, "").replace(/```$/, "").trim();
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { buildMarkdown } = require("./generator") as { buildMarkdown: typeof import("./generator").buildMarkdown };
    const d = JSON.parse(json) as { summary?: string; testPoints?: TestPoint[]; testCases?: TestCase[] };
    const testPoints = d.testPoints ?? fallback.testPoints;
    const testCases  = d.testCases  ?? fallback.testCases;
    const summary    = d.summary    ?? fallback.summary;
    return { ...fallback, summary, testPoints, testCases, markdownOutput: buildMarkdown(testPoints, testCases, summary, lang) };
  } catch {
    return fallback;
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}
