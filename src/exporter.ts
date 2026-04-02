/**
 * Exporters:
 *   exportToExcel    → .xlsx  (3 sheets: TestCases / TestPoints / Stats)
 *   exportToMarkdown → .md
 *   exportToXMind    → .xmind (zip containing content.xml — XMind 2022 format)
 */

import XLSX from "xlsx";
import path from "path";
import fs from "fs";
import { createWriteStream } from "fs";
import archiver from "archiver";
import { TestCase, TestPoint, ReviewRound, Language } from "./types";

// ─── Excel ─────────────────────────────────────────────────────────────────────

export function exportToExcel(
  testCases: TestCase[],
  testPoints: TestPoint[],
  outputDir: string,
  filename = "test-cases"
): string {
  fs.mkdirSync(outputDir, { recursive: true });
  const wb = XLSX.utils.book_new();

  // Sheet 1 — Test Cases
  const caseRows = [
    ["ID", "Module", "Feature", "Title", "Preconditions", "Steps", "Expected Result", "Priority", "Type", "Automated"],
    ...testCases.map((tc) => [
      tc.id, tc.module, tc.feature, tc.title, tc.preconditions,
      tc.steps.map((s, i) => `${i + 1}. ${s}`).join("\n"),
      tc.expectedResult, tc.priority, tc.type, tc.automated,
    ]),
  ];
  const wsCase = XLSX.utils.aoa_to_sheet(caseRows);
  wsCase["!cols"] = [
    { wch: 10 }, { wch: 16 }, { wch: 20 }, { wch: 36 }, { wch: 26 },
    { wch: 52 }, { wch: 36 }, { wch: 8 }, { wch: 16 }, { wch: 10 },
  ];
  XLSX.utils.book_append_sheet(wb, wsCase, "Test Cases");

  // Sheet 2 — Test Points
  const pointRows = [
    ["Module", "Feature", "Description", "Priority"],
    ...testPoints.map((p) => [p.module, p.feature, p.description, p.priority]),
  ];
  const wsPoint = XLSX.utils.aoa_to_sheet(pointRows);
  wsPoint["!cols"] = [{ wch: 18 }, { wch: 22 }, { wch: 52 }, { wch: 8 }];
  XLSX.utils.book_append_sheet(wb, wsPoint, "Test Points");

  // Sheet 3 — Statistics
  const p0 = testCases.filter((t) => t.priority === "P0").length;
  const p1 = testCases.filter((t) => t.priority === "P1").length;
  const p2 = testCases.filter((t) => t.priority === "P2").length;
  const p3 = testCases.filter((t) => t.priority === "P3").length;
  const autoYes = testCases.filter((t) => ["Yes", "是"].includes(t.automated)).length;
  const statsRows: (string | number)[][] = [
    ["Dimension", "Value"],
    ["Total Cases", testCases.length],
    ["Total Test Points", testPoints.length],
    ["", ""],
    ["P0 Cases", p0], ["P1 Cases", p1], ["P2 Cases", p2], ["P3 Cases", p3],
    ["", ""],
    ["Automatable", autoYes],
    ["Automation Rate", testCases.length > 0 ? `${Math.round((autoYes / testCases.length) * 100)}%` : "0%"],
  ];
  const wsStats = XLSX.utils.aoa_to_sheet(statsRows);
  wsStats["!cols"] = [{ wch: 20 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, wsStats, "Statistics");

  const outPath = path.join(outputDir, `${filename}-${Date.now()}.xlsx`);
  XLSX.writeFile(wb, outPath);
  return outPath;
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
    creator: { name: "testcase-generator", version: "2.0.0" },
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
    title: "Test Mind Map",
    rootTopic,
  };

  return JSON.stringify([sheet], null, 2);
}
