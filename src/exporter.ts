/**
 * Exporters:
 *   exportToExcel    → .xlsx  (3 sheets: TestCases / TestPoints / Stats)
 *   exportToMarkdown → .md
 *   exportToXMind    → .xmind (zip containing content.xml — XMind 2022 format)
 */

import ExcelJS from "exceljs";
import path from "path";
import fs from "fs";
import { createWriteStream } from "fs";
import archiver from "archiver";
import { TestCase, TestPoint, Language } from "./types";

// ─── Excel ─────────────────────────────────────────────────────────────────────

export function exportToExcel(
  testCases: TestCase[],
  testPoints: TestPoint[],
  outputDir: string,
  filename = "test-cases",
  lang: Language = "en"
): Promise<string> {
  fs.mkdirSync(outputDir, { recursive: true });
  const wb = new ExcelJS.Workbook();
  const zh = lang === "zh";
  const T = {
    sheetCases: zh ? "测试用例" : "Test Cases",
    sheetPoints: zh ? "测试点" : "Test Points",
    sheetStats: zh ? "统计信息" : "Statistics",
    id: "ID",
    module: zh ? "模块" : "Module",
    feature: zh ? "功能点" : "Feature",
    title: zh ? "标题" : "Title",
    preconditions: zh ? "前置条件" : "Preconditions",
    steps: zh ? "步骤" : "Steps",
    expectedResult: zh ? "预期结果" : "Expected Result",
    priority: zh ? "优先级" : "Priority",
    type: zh ? "类型" : "Type",
    automated: zh ? "自动化" : "Automated",
    description: zh ? "描述" : "Description",
    dimension: zh ? "维度" : "Dimension",
    value: zh ? "值" : "Value",
    totalCases: zh ? "用例总数" : "Total Cases",
    totalPoints: zh ? "测试点总数" : "Total Test Points",
    p0Cases: zh ? "P0 用例" : "P0 Cases",
    p1Cases: zh ? "P1 用例" : "P1 Cases",
    p2Cases: zh ? "P2 用例" : "P2 Cases",
    p3Cases: zh ? "P3 用例" : "P3 Cases",
    automatable: zh ? "可自动化数量" : "Automatable",
    automationRate: zh ? "自动化占比" : "Automation Rate",
  };

  const wsCase = wb.addWorksheet(T.sheetCases);
  wsCase.columns = [
    { header: T.id, key: "id", width: 10 },
    { header: T.module, key: "module", width: 16 },
    { header: T.feature, key: "feature", width: 20 },
    { header: T.title, key: "title", width: 36 },
    { header: T.preconditions, key: "preconditions", width: 26 },
    { header: T.steps, key: "steps", width: 52 },
    { header: T.expectedResult, key: "expectedResult", width: 36 },
    { header: T.priority, key: "priority", width: 8 },
    { header: T.type, key: "type", width: 16 },
    { header: T.automated, key: "automated", width: 10 },
  ];
  testCases.forEach((tc) => {
    wsCase.addRow({
      id: tc.id,
      module: tc.module,
      feature: tc.feature,
      title: tc.title,
      preconditions: tc.preconditions,
      steps: tc.steps.map((s, i) => `${i + 1}. ${s}`).join("\n"),
      expectedResult: tc.expectedResult,
      priority: tc.priority,
      type: tc.type,
      automated: tc.automated,
    });
  });
  wsCase.getRow(1).font = { bold: true };

  const wsPoint = wb.addWorksheet(T.sheetPoints);
  wsPoint.columns = [
    { header: T.module, key: "module", width: 18 },
    { header: T.feature, key: "feature", width: 22 },
    { header: T.description, key: "description", width: 52 },
    { header: T.priority, key: "priority", width: 8 },
  ];
  testPoints.forEach((p) => {
    wsPoint.addRow({
      module: p.module,
      feature: p.feature,
      description: p.description,
      priority: p.priority,
    });
  });
  wsPoint.getRow(1).font = { bold: true };

  // Sheet 3 — Statistics
  const p0 = testCases.filter((t) => t.priority === "P0").length;
  const p1 = testCases.filter((t) => t.priority === "P1").length;
  const p2 = testCases.filter((t) => t.priority === "P2").length;
  const p3 = testCases.filter((t) => t.priority === "P3").length;
  const autoYes = testCases.filter((t) => ["Yes", "是"].includes(t.automated)).length;
  const wsStats = wb.addWorksheet(T.sheetStats);
  wsStats.columns = [
    { header: T.dimension, key: "dimension", width: 20 },
    { header: T.value, key: "value", width: 14 },
  ];
  [
    { dimension: T.totalCases, value: testCases.length },
    { dimension: T.totalPoints, value: testPoints.length },
    { dimension: "", value: "" },
    { dimension: T.p0Cases, value: p0 },
    { dimension: T.p1Cases, value: p1 },
    { dimension: T.p2Cases, value: p2 },
    { dimension: T.p3Cases, value: p3 },
    { dimension: "", value: "" },
    { dimension: T.automatable, value: autoYes },
    {
      dimension: T.automationRate,
      value: testCases.length > 0 ? `${Math.round((autoYes / testCases.length) * 100)}%` : "0%",
    },
  ].forEach((row) => wsStats.addRow(row));
  wsStats.getRow(1).font = { bold: true };

  const outPath = path.join(outputDir, `${filename}-${Date.now()}.xlsx`);
  return wb.xlsx.writeFile(outPath).then(() => outPath);
}

// ─── Markdown ──────────────────────────────────────────────────────────────────

export function exportToMarkdown(markdown: string, outputDir: string, filename = "test-cases"): string {
  fs.mkdirSync(outputDir, { recursive: true });
  const outPath = path.join(outputDir, `${filename}-${Date.now()}.md`);
  fs.writeFileSync(outPath, markdown, "utf-8");
  return outPath;
}

// ─── XMind ────────────────────────────────────────────────────────────────────
//
// XMind 2022 file format is a ZIP containing:
//   content.json  — main map data (XMind 2022+)
//   metadata.json — file metadata
//
// We build a mind map with this structure:
//
//   Root (Requirement Title)
//   └── [Module 1]
//       └── [Feature A] [P0]
//           └── TC-001: test point description
//       └── [Feature B]
//           └── TC-002: ...
//   └── [Module 2]
//       └── ...

export function exportToXMind(
  testPoints: TestPoint[],
  outputDir: string,
  rootTitle: string,
  filename = "test-mindmap",
  lang: Language = "en"
): Promise<string> {
  fs.mkdirSync(outputDir, { recursive: true });
  const outPath = path.join(outputDir, `${filename}-${Date.now()}.xmind`);

  const contentJson = buildXMindContent(testPoints, rootTitle, lang);
  const metaJson = JSON.stringify({
    creator: { name: "testcase-generator", version: "1.0.0" },
    created: new Date().toISOString(),
  });

  return new Promise((resolve, reject) => {
    const output = createWriteStream(outPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", () => resolve(outPath));
    archive.on("error", reject);
    archive.pipe(output);

    archive.append(contentJson, { name: "content.json" });
    archive.append(metaJson, { name: "metadata.json" });
    archive.finalize();
  });
}

// ─── XMind content builder ────────────────────────────────────────────────────

interface XMindTopic {
  id: string;
  title: string;
  children?: { attached: XMindTopic[] };
  labels?: string[];
  markers?: Array<{ markerId: string }>;
  style?: { properties?: Record<string, string> };
}

interface XMindSheet {
  id: string;
  title: string;
  rootTopic: XMindTopic;
  theme?: Record<string, unknown>;
}

function buildXMindContent(testPoints: TestPoint[], rootTitle: string, lang: Language): string {
  // Priority → color marker mapping (XMind built-in markers)
  const PRIORITY_MARKERS: Record<string, string> = {
    P0: "priority-1",
    P1: "priority-2",
    P2: "priority-3",
    P3: "priority-4",
  };

  // Priority → background color
  const PRIORITY_COLORS: Record<string, string> = {
    P0: "#fee2e2",
    P1: "#fef3c7",
    P2: "#d1fae5",
    P3: "#f1f5f9",
  };

  let idCounter = 1;
  const uid = () => `node-${String(idCounter++).padStart(6, "0")}`;

  // Group: module → feature → points
  const byModule: Record<string, Record<string, TestPoint[]>> = {};
  for (const p of testPoints) {
    if (!byModule[p.module]) byModule[p.module] = {};
    if (!byModule[p.module][p.feature]) byModule[p.module][p.feature] = [];
    byModule[p.module][p.feature].push(p);
  }

  const moduleNodes: XMindTopic[] = Object.entries(byModule).map(([mod, features]) => {
    const featureNodes: XMindTopic[] = Object.entries(features).map(([feat, points]) => {
      const pointNodes: XMindTopic[] = points.map((p) => ({
        id: uid(),
        title: `[${p.priority}] ${p.description}`,
        markers: [{ markerId: PRIORITY_MARKERS[p.priority] ?? "priority-4" }],
        style: { properties: { "background-color": PRIORITY_COLORS[p.priority] ?? "#f8fafc" } },
      }));
      return {
        id: uid(),
        title: feat,
        children: { attached: pointNodes },
        labels: [lang === "zh" ? `${points.length}个测试点` : `${points.length} points`],
      };
    });
    return {
      id: uid(),
      title: mod,
      children: { attached: featureNodes },
    };
  });

  const rootTopic: XMindTopic = {
    id: uid(),
    title: rootTitle,
    children: { attached: moduleNodes },
    style: { properties: { "background-color": "#6366f1", "color": "#ffffff" } },
  };

  // Add legend nodes
  const legendLabel = lang === "zh" ? "优先级说明" : "Priority Legend";
  const legendItems = lang === "zh"
    ? ["P0: 核心功能（必须通过）", "P1: 重要功能", "P2: 边界/异常", "P3: 兼容/性能/安全"]
    : ["P0: Core / Critical (must pass)", "P1: Important features", "P2: Boundary / Error flows", "P3: Compatibility / Performance / Security"];

  rootTopic.children!.attached.push({
    id: uid(),
    title: legendLabel,
    children: {
      attached: legendItems.map((l, i) => ({
        id: uid(),
        title: l,
        markers: [{ markerId: `priority-${i + 1}` }],
      })),
    },
  });

  const sheet: XMindSheet = {
    id: "sheet-1",
    title: lang === "zh" ? "测试思维导图" : "Test Mind Map",
    rootTopic,
  };

  return JSON.stringify([sheet], null, 2);
}
