#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");
const outDir = path.join(rootDir, "release", "npm-package");

const filesToCopy = [
  "dist",
  "public",
  "SKILL.md",
  ".env.example",
];

function ensureCleanDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

function copyIntoPackage(relativePath) {
  const src = path.join(rootDir, relativePath);
  const dest = path.join(outDir, relativePath);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
}

function main() {
  ensureCleanDir(outDir);

  for (const relativePath of filesToCopy) {
    copyIntoPackage(relativePath);
  }

  const packageJson = JSON.parse(
    fs.readFileSync(path.join(rootDir, "package.json"), "utf8"),
  );

  packageJson.description =
    "AI-powered test case generation for PRDs, specs, and multimodal QA inputs";
  packageJson.files = ["dist", "public", "README.md", "SKILL.md", ".env.example"];
  packageJson.publishConfig = { ...(packageJson.publishConfig || {}), access: "public" };
  delete packageJson.devDependencies;
  packageJson.scripts = {};

  fs.writeFileSync(
    path.join(outDir, "package.json"),
    `${JSON.stringify(packageJson, null, 2)}\n`,
    "utf8",
  );

  fs.copyFileSync(
    path.join(rootDir, "package-lock.json"),
    path.join(outDir, "package-lock.json"),
  );
  fs.copyFileSync(
    path.join(rootDir, "docs", "npm-readme.md"),
    path.join(outDir, "README.md"),
  );
}

main();
