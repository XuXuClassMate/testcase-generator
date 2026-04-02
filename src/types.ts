// ─── AI Model Configuration ────────────────────────────────────────────────────
// Each entry in `models[]` is one fully-configured model slot.
// You can have 1 model or 10 — the system always assigns exactly 3 reviewer roles.

export type AIVendor =
  | "anthropic"   // Claude
  | "openai"      // GPT-4o, etc.
  | "deepseek"    // DeepSeek-V3 / R1
  | "minimax"     // MiniMax-Text-01
  | "qwen"        // Alibaba Qwen
  | "gemini"      // Google Gemini
  | "moonshot"    // Kimi
  | "zhipu"       // ChatGLM
  | "custom";     // Any OpenAI-compatible endpoint

/** A single model entry in the models list */
export interface ModelEntry {
  /** Unique identifier for this slot, e.g. "my-claude", "gpt4o-reviewer" */
  id: string;
  /** Human-readable label shown in UI */
  label?: string;
  /** Model vendor — determines which SDK adapter to use */
  vendor: AIVendor;
  /** Exact model name passed to the API, e.g. "claude-opus-4-5", "gpt-4o" */
  model: string;
  /** API base URL — required for custom/self-hosted, optional for standard vendors */
  baseUrl?: string;
  /** API key for this specific model slot */
  apiKey: string;
  /** Extra vendor-specific params, e.g. { "temperature": 0.2, "top_p": 0.9 } */
  params?: Record<string, unknown>;
  /**
   * Role assignment:
   * - "generator"   → produces the initial test cases
   * - "reviewer"    → used for multi-model review loop (up to 3 reviewer roles cycled)
   * - "both"        → can serve as generator AND reviewer
   * If fewer than 3 models have reviewer/both role, slots are filled by cycling available models.
   */
  role: "generator" | "reviewer" | "both";
}

// ─── Three fixed reviewer personas (written into code 🔥) ─────────────────────

export type ReviewerPersona = "test_manager" | "dev_manager" | "product_manager";

export interface ReviewerPersonaConfig {
  id: ReviewerPersona;
  name: { zh: string; en: string };
  focus: { zh: string[]; en: string[] };
  systemAddendum: { zh: string; en: string };
}

export const REVIEWER_PERSONAS: ReviewerPersonaConfig[] = [
  {
    id: "test_manager",
    name: { zh: "测试经理", en: "Test Manager" },
    focus: {
      zh: ["测试覆盖率", "边界值与异常场景", "可执行性", "自动化可行性"],
      en: ["Test coverage", "Boundary & exception scenarios", "Executability", "Automation feasibility"],
    },
    systemAddendum: {
      zh: `你扮演资深测试经理角色进行评审。重点关注：
1. 测试覆盖率是否足够（正常流程、异常流程、边界值）
2. 每个测试步骤是否具体可执行
3. 预期结果是否可量化验证
4. 是否有重复或冗余用例
5. 自动化优先级建议是否合理`,
      en: `You are reviewing as a senior Test Manager. Focus on:
1. Test coverage completeness (happy path, error flows, edge cases)
2. Whether each step is concrete and executable
3. Whether expected results are measurable and verifiable
4. Redundant or duplicate cases
5. Automation priority recommendations`,
    },
  },
  {
    id: "dev_manager",
    name: { zh: "开发经理", en: "Dev Manager" },
    focus: {
      zh: ["技术实现可行性", "接口与集成测试", "安全漏洞场景", "性能边界"],
      en: ["Technical feasibility", "API & integration tests", "Security vulnerabilities", "Performance boundaries"],
    },
    systemAddendum: {
      zh: `你扮演开发经理角色进行评审。重点关注：
1. 用例步骤是否符合实际技术实现逻辑
2. 是否覆盖了关键的API接口测试和集成场景
3. 是否包含SQL注入、XSS、CSRF、越权等安全测试
4. 是否考虑了并发、缓存、超时等技术边界场景
5. 前置条件中的技术环境要求是否明确`,
      en: `You are reviewing as a Dev Manager. Focus on:
1. Whether steps align with actual technical implementation logic
2. Coverage of key API and integration test scenarios
3. Inclusion of SQL injection, XSS, CSRF, and privilege escalation tests
4. Technical boundary scenarios: concurrency, caching, timeouts
5. Clear technical environment requirements in preconditions`,
    },
  },
  {
    id: "product_manager",
    name: { zh: "产品经理", en: "Product Manager" },
    focus: {
      zh: ["业务逻辑正确性", "用户体验场景", "需求一致性", "关键业务流覆盖"],
      en: ["Business logic correctness", "UX scenarios", "Requirements alignment", "Critical business flow coverage"],
    },
    systemAddendum: {
      zh: `你扮演产品经理角色进行评审。重点关注：
1. 测试用例是否准确反映了需求文档中的业务逻辑
2. 是否覆盖了关键的用户使用场景和体验路径
3. 是否有遗漏的业务规则或产品约束条件
4. 错误提示和用户引导是否被验证
5. 是否与PRD/设计稿保持一致`,
      en: `You are reviewing as a Product Manager. Focus on:
1. Whether test cases accurately reflect business logic from the requirements
2. Coverage of critical user journeys and experience paths
3. Missing business rules or product constraints
4. Validation of error messages and user guidance flows
5. Alignment with PRD/design specifications`,
    },
  },
];

// ─── Plugin Config ─────────────────────────────────────────────────────────────

export type Language = "zh" | "en";
export type TestStage = "requirement" | "development" | "prerelease";

export interface PluginConfig {
  /** Full list of configured model slots */
  models: ModelEntry[];
  standalonePort: number;
  outputDir: string;
  language: Language;
  maxReviewRounds: number;
  reviewScoreThreshold: number;
  enableReviewLoop: boolean;
}

export const DEFAULT_CONFIG: PluginConfig = {
  models: [],
  standalonePort: 3456,
  outputDir: "./testcase-output",
  language: "en",
  maxReviewRounds: 5,
  reviewScoreThreshold: 90,
  enableReviewLoop: true,
};

function isReviewerCapable(model: ModelEntry): boolean {
  return model.role === "reviewer" || model.role === "both";
}

export function formatModelLabel(model: ModelEntry): string {
  return model.label ?? `${model.vendor}/${model.model || model.id}`;
}

/** Returns the generator model (first model with role=generator or role=both) */
export function getGeneratorModel(cfg: PluginConfig): ModelEntry {
  const m = cfg.models.find((m) => m.role === "generator" || m.role === "both");
  if (!m) throw new Error("No generator model configured. Add a model with role='generator' or 'both'.");
  return m;
}

export function getGeneratorLabel(cfg: PluginConfig): string {
  return formatModelLabel(getGeneratorModel(cfg));
}

export function getReviewerCapableModels(cfg: PluginConfig): ModelEntry[] {
  return cfg.models.filter(isReviewerCapable);
}

export function getReviewerLabels(cfg: PluginConfig): string[] {
  return getReviewerCapableModels(cfg).map(formatModelLabel);
}

/**
 * Returns exactly 3 reviewer model slots, one per persona.
 * If fewer than 3 reviewer-capable models exist, cycles through available ones.
 */
export function getReviewerModels(cfg: PluginConfig): Array<{ model: ModelEntry; persona: ReviewerPersonaConfig }> {
  const candidates = getReviewerCapableModels(cfg);
  if (candidates.length === 0) {
    // Fallback: use generator model for all 3 personas
    const gen = getGeneratorModel(cfg);
    return REVIEWER_PERSONAS.map((p) => ({ model: gen, persona: p }));
  }
  return REVIEWER_PERSONAS.map((persona, i) => ({
    model: candidates[i % candidates.length],
    persona,
  }));
}

// ─── Test Case Model ───────────────────────────────────────────────────────────

export type Priority = "P0" | "P1" | "P2" | "P3";

export interface TestPoint {
  module: string;
  feature: string;
  description: string;
  priority: Priority;
}

export interface TestCase {
  id: string;
  module: string;
  feature: string;
  title: string;
  preconditions: string;
  steps: string[];
  expectedResult: string;
  priority: Priority;
  type: string;
  automated: string;
}

// ─── Review / Scoring ──────────────────────────────────────────────────────────

export interface ReviewScores {
  coverage: number;       // max 30
  logicIntegrity: number; // max 20
  executability: number;  // max 20
  clarity: number;        // max 15
  security: number;       // max 15
  total: number;          // max 100
}

export interface ReviewComment {
  modelId: string;
  vendor: AIVendor;
  persona: ReviewerPersona;
  personaName: string;
  scores: ReviewScores;
  issues: string[];
  suggestions: string[];
  approved: boolean;
}

export interface ReviewRound {
  round: number;
  comments: ReviewComment[];
  aggregatedScore: number;
  aggregatedIssues: string[];
  passed: boolean;
}

// ─── Generation Result ─────────────────────────────────────────────────────────

export interface GenerationResult {
  testPoints: TestPoint[];
  testCases: TestCase[];
  summary: string;
  markdownOutput: string;
  language: Language;
  stage: TestStage;
  reviewRounds?: ReviewRound[];
  finalScore?: number;
}

// ─── Input ─────────────────────────────────────────────────────────────────────

export type InputType = "text" | "pdf" | "docx" | "txt" | "image" | "video";

export interface ParsedContent {
  text: string;
  images: string[];
  source: string;
  inputType: InputType;
}

export interface GenerateRequest {
  content: ParsedContent[];
  prompt?: string;
  stage?: TestStage;
  language?: Language;
  enableReview?: boolean;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface ProgressEvent {
  type: "generating" | "reviewing" | "refining" | "done" | "error";
  round?: number;
  score?: number;
  message: string;
}
