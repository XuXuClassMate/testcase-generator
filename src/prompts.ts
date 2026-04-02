/**
 * Built-in prompt templates for each testing stage.
 * Written directly into code as per the product requirement 🔥
 */

import { TestStage, Language } from "./types";

// ─── Stage prompt definitions ─────────────────────────────────────────────────

interface StagePrompt {
  name: { zh: string; en: string };
  description: { zh: string; en: string };
  systemAddendum: { zh: string; en: string };
  checkList: { zh: string[]; en: string[] };
}

const STAGE_PROMPTS: Record<TestStage, StagePrompt> = {

  // ── 需求评审阶段 ────────────────────────────────────────────────────────────
  requirement: {
    name: {
      zh: "需求评审阶段",
      en: "Requirement Review Stage",
    },
    description: {
      zh: "聚焦需求完整性、流程清晰度和边界条件覆盖",
      en: "Focus on requirement completeness, process clarity, and boundary coverage",
    },
    systemAddendum: {
      zh: `
在需求评审阶段，你需要额外关注：
1. 需求是否完整明确（是否有歧义、缺失信息）
2. 业务流程是否清晰（主流程、分支流程、异常流程）
3. 边界条件是否覆盖（数值边界、时间边界、容量边界）
4. 权限与角色是否明确（谁能操作什么）
5. 非功能需求是否考虑（性能、安全、兼容性要求）
6. 重点生成：P0主流程用例、边界值用例、权限校验用例`,
      en: `
In the Requirement Review stage, pay special attention to:
1. Requirement completeness and clarity (ambiguities, missing information)
2. Business process clarity (happy path, branch flows, error flows)
3. Boundary condition coverage (numeric, temporal, capacity boundaries)
4. Permission and role definitions (who can do what)
5. Non-functional requirements (performance, security, compatibility)
6. Focus on: P0 core flow cases, boundary value cases, permission validation cases`,
    },
    checkList: {
      zh: [
        "需求是否完整明确",
        "流程是否清晰（主流程/分支/异常）",
        "边界条件是否覆盖",
        "权限是否明确",
        "是否有非功能需求",
      ],
      en: [
        "Requirements are complete and unambiguous",
        "Flows are clear (happy path / branches / error paths)",
        "Boundary conditions are covered",
        "Permissions and roles are defined",
        "Non-functional requirements are addressed",
      ],
    },
  },

  // ── 开发提测阶段 ────────────────────────────────────────────────────────────
  development: {
    name: {
      zh: "开发提测阶段",
      en: "Development Handoff Stage",
    },
    description: {
      zh: "覆盖功能、UI、安全、兼容性和易用性",
      en: "Cover functionality, UI, security, compatibility, and usability",
    },
    systemAddendum: {
      zh: `
在开发提测阶段，你需要全面覆盖以下维度：

【功能测试】
- 功能是否符合需求文档
- 输入校验是否合理（必填项、格式、长度）
- 数据处理是否正确
- 异常情况处理是否优雅

【UI测试】
- 布局是否符合设计规范
- 交互是否流畅正常
- 响应式布局是否正确
- 文案是否准确无误

【安全测试】
- 是否存在越权访问风险
- 是否防范 SQL 注入
- 是否防范 XSS 攻击
- 是否防范 CSRF 攻击
- 敏感数据是否加密传输

【兼容性测试】
- 主流浏览器适配（Chrome/Firefox/Safari/Edge）
- 移动端/桌面端适配
- 不同分辨率下的显示

【易用性测试】
- 操作流程是否简单直观
- 错误提示是否清晰友好
- 加载状态是否有反馈`,
      en: `
In the Development Handoff stage, cover the following dimensions:

[Functional Testing]
- Does the feature match the requirements?
- Input validation (required fields, formats, length limits)
- Data processing correctness
- Graceful error handling

[UI Testing]
- Layout conformance to design specs
- Smooth and correct interactions
- Responsive layout across breakpoints
- Accurate and consistent copy

[Security Testing]
- Unauthorized access prevention
- SQL injection protection
- XSS attack prevention
- CSRF protection
- Encrypted transmission of sensitive data

[Compatibility Testing]
- Major browsers (Chrome / Firefox / Safari / Edge)
- Mobile and desktop adaptation
- Different screen resolutions

[Usability Testing]
- Simple and intuitive user flows
- Clear and friendly error messages
- Loading state feedback`,
    },
    checkList: {
      zh: [
        "功能符合需求，输入校验合理",
        "UI布局规范，交互正常",
        "无越权，防SQL/XSS/CSRF",
        "浏览器/设备兼容",
        "操作简单，提示清晰",
      ],
      en: [
        "Features match requirements, input validation is correct",
        "UI layout is correct, interactions work properly",
        "No unauthorized access, protected against SQL/XSS/CSRF",
        "Compatible across browsers and devices",
        "Simple UX with clear feedback messages",
      ],
    },
  },

  // ── 上线前阶段 ─────────────────────────────────────────────────────────────
  prerelease: {
    name: {
      zh: "上线前阶段",
      en: "Pre-Release Stage",
    },
    description: {
      zh: "回归、冒烟、性能、安全和部署验证",
      en: "Regression, smoke testing, performance, security, and deployment verification",
    },
    systemAddendum: {
      zh: `
在上线前阶段，测试重点是风险控制和验收：

【回归测试】
- 所有P0、P1用例必须通过
- 历史缺陷是否复现验证
- 关键业务流程全链路验证

【冒烟测试】
- 核心功能快速验证（5-10分钟可执行完毕）
- 系统能否正常启动和访问
- 核心入口功能是否可用

【性能测试】
- 页面加载时间 ≤ 3s
- API响应时间 ≤ 500ms（P95）
- 并发用户数达标
- 内存/CPU使用率在正常范围

【安全验证】
- 无高危漏洞（CVSS ≥ 7.0）
- 敏感信息无泄露
- 权限模型验证通过

【部署验证】
- 部署脚本执行无错误
- 环境变量配置正确
- 数据库迁移执行正常
- 监控告警配置正确
- 回滚方案验证`,
      en: `
In the Pre-Release stage, focus on risk control and acceptance:

[Regression Testing]
- All P0 and P1 cases must pass
- Historical bugs verified as fixed
- End-to-end critical business flow validation

[Smoke Testing]
- Core feature rapid validation (5-10 min to execute)
- System starts and is accessible
- Core entry points are functional

[Performance Testing]
- Page load time ≤ 3s
- API response time ≤ 500ms (P95)
- Concurrent user count meets spec
- Memory/CPU usage within normal range

[Security Verification]
- No high-severity vulnerabilities (CVSS ≥ 7.0)
- No sensitive data leakage
- Permission model passes validation

[Deployment Verification]
- Deployment scripts run without errors
- Environment variables configured correctly
- Database migrations execute successfully
- Monitoring and alerts configured correctly
- Rollback plan validated`,
    },
    checkList: {
      zh: [
        "回归测试全通过",
        "冒烟测试通过",
        "性能达标（加载≤3s，API≤500ms）",
        "无高危漏洞",
        "部署验证通过，回滚方案就绪",
      ],
      en: [
        "All regression tests pass",
        "Smoke tests pass",
        "Performance meets spec (load≤3s, API≤500ms)",
        "No high-severity vulnerabilities",
        "Deployment verified, rollback plan ready",
      ],
    },
  },
};

// ─── Public API ───────────────────────────────────────────────────────────────

export function getStageSystemAddendum(stage: TestStage, lang: Language): string {
  return STAGE_PROMPTS[stage].systemAddendum[lang];
}

export function getStageCheckList(stage: TestStage, lang: Language): string[] {
  return STAGE_PROMPTS[stage].checkList[lang];
}

export function getStageName(stage: TestStage, lang: Language): string {
  return STAGE_PROMPTS[stage].name[lang];
}

export function getStageDescription(stage: TestStage, lang: Language): string {
  return STAGE_PROMPTS[stage].description[lang];
}

export function getAllStages(): TestStage[] {
  return ["requirement", "development", "prerelease"];
}

export { STAGE_PROMPTS };
