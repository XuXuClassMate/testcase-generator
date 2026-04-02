# 🦞 AI Test Case Generator v2

AI-powered test case generation with a **three-persona review loop** (Test Manager · Dev Manager · Product Manager).

Runs as an **OpenClaw plugin** or **standalone web service**.  
Supports PDF · Word · TXT · Images · Video input.  
Exports to **Excel**, **Markdown**, and **XMind** mind map.

---

## Table of Contents

- [Model Configuration](#model-configuration) ← Read this first
- [Three Reviewer Personas](#three-reviewer-personas)
- [Scoring Algorithm](#scoring-algorithm)
- [Installation](#installation)
- [OpenClaw Plugin Mode](#openclaw-plugin-mode)
- [Standalone Web Mode](#standalone-web-mode)
- [Deployment Methods](#deployment-methods)
- [API Reference](#api-reference)
- [Project Structure](#project-structure)

---

## Model Configuration

All AI models are configured as a **flat list**. Each entry is one model slot with its own vendor, model name, base URL, API key, and role.

The system always assigns **exactly 3 reviewer personas** regardless of how many models you configure — it cycles through available reviewer-capable models if fewer than 3 exist.

### Configuration schema

```jsonc
// openclaw config.yaml → plugins.entries.testcase-generator.config
{
  "models": [
    {
      "id": "my-claude",              // unique slot identifier
      "label": "Claude Generator",   // display name (optional)
      "vendor": "anthropic",         // vendor (see table below)
      "model": "claude-opus-4-5",    // exact model name passed to API
      "baseUrl": "",                  // leave empty for standard vendors
      "apiKey": "sk-ant-...",        // API key for this slot
      "role": "generator",           // generator | reviewer | both
      "params": { "temperature": 0.3 }  // optional extra params
    },
    {
      "id": "gpt4o-reviewer",
      "label": "GPT-4o (Dev Manager)",
      "vendor": "openai",
      "model": "gpt-4o",
      "apiKey": "sk-...",
      "role": "reviewer"
    },
    {
      "id": "deepseek-reviewer",
      "label": "DeepSeek (Product Manager)",
      "vendor": "deepseek",
      "model": "deepseek-chat",
      "apiKey": "sk-...",
      "role": "reviewer"
    }
  ]
}
```

### Supported vendors & default endpoints

| `vendor` | Default `baseUrl` | Recommended `model` | Notes |
|----------|-------------------|---------------------|-------|
| `anthropic` | `https://api.anthropic.com` | `claude-opus-4-5` | Uses Anthropic SDK natively |
| `openai` | `https://api.openai.com/v1` | `gpt-4o` | Official OpenAI SDK |
| `deepseek` | `https://api.deepseek.com/v1` | `deepseek-chat` | OpenAI-compatible |
| `minimax` | `https://api.minimax.chat/v1` | `MiniMax-Text-01` | OpenAI-compatible |
| `qwen` | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-max` | OpenAI-compatible |
| `gemini` | `https://generativelanguage.googleapis.com/v1beta/openai` | `gemini-2.0-flash` | OpenAI-compatible |
| `moonshot` | `https://api.moonshot.cn/v1` | `moonshot-v1-8k` | OpenAI-compatible |
| `zhipu` | `https://open.bigmodel.cn/api/paas/v4` | `glm-4` | OpenAI-compatible |
| `custom` | **required** | any | Any OpenAI-compatible endpoint |

### Role assignment rules

| `role` | Can generate? | Can review? |
|--------|---------------|-------------|
| `generator` | ✅ | ❌ |
| `reviewer` | ❌ | ✅ |
| `both` | ✅ | ✅ |

**If you only have 1 model**, set `role: "both"` — it will generate and then self-review with all 3 personas.

### Minimal single-model config

```jsonc
{
  "models": [
    {
      "id": "claude-all",
      "vendor": "anthropic",
      "model": "claude-opus-4-5",
      "apiKey": "sk-ant-...",
      "role": "both"               // generates + reviews as all 3 personas
    }
  ]
}
```

### Full multi-model config (recommended)

```jsonc
{
  "models": [
    {
      "id": "generator",
      "label": "Claude (Generator)",
      "vendor": "anthropic",
      "model": "claude-opus-4-5",
      "apiKey": "sk-ant-...",
      "role": "generator"
    },
    {
      "id": "reviewer-1",
      "label": "GPT-4o (Test Manager)",
      "vendor": "openai",
      "model": "gpt-4o",
      "apiKey": "sk-...",
      "role": "reviewer"
    },
    {
      "id": "reviewer-2",
      "label": "DeepSeek (Dev Manager)",
      "vendor": "deepseek",
      "model": "deepseek-chat",
      "apiKey": "sk-...",
      "role": "reviewer"
    },
    {
      "id": "reviewer-3",
      "label": "Qwen (Product Manager)",
      "vendor": "qwen",
      "model": "qwen-max",
      "apiKey": "sk-...",
      "role": "reviewer"
    }
  ],
  "language": "en",
  "enableReviewLoop": true,
  "reviewScoreThreshold": 90,
  "maxReviewRounds": 5
}
```

### Custom / self-hosted endpoint

```jsonc
{
  "id": "my-local-llm",
  "vendor": "custom",
  "model": "llama-3.1-70b",
  "baseUrl": "http://localhost:11434/v1",
  "apiKey": "not-needed",
  "role": "both"
}
```

---

## Three Reviewer Personas

Regardless of how many models you configure, the review loop always assigns **exactly 3 personas**. Each persona has a distinct focus and system prompt baked into the code.

### 🎯 Test Manager
**Focus:** Test coverage · Executability · Boundary & exception scenarios · Automation feasibility

Reviews whether test steps are concrete and executable, whether all flows (happy/error/boundary) are covered, and whether automation priority is sensible.

### 💻 Dev Manager
**Focus:** Technical feasibility · API & integration tests · Security (SQL injection, XSS, CSRF, privilege escalation) · Performance boundaries (concurrency, timeouts, caching)

Reviews whether test steps align with implementation logic and whether critical security edge cases are included.

### 📋 Product Manager
**Focus:** Business logic correctness · User journey coverage · Requirements alignment · Error message validation

Reviews whether test cases accurately reflect the product requirements and user experience expectations.

---

## Scoring Algorithm

Total score: **100 points**

| Dimension | Max | Breakdown |
|-----------|-----|-----------|
| Coverage | 30 | Happy paths (10) + Error branches (10) + Boundary values (10) |
| Logic Integrity | 20 | Step order (10) + Preconditions (10) |
| Executability | 20 | Concrete steps (10) + Verifiable results (10) |
| Clarity | 15 | Accurate titles (5) + Unambiguous descriptions (10) |
| Security | 15 | Permission tests (5) + Injection/XSS (5) + Error handling (5) |

**Termination conditions (first met wins):**
1. Score ≥ threshold (default 90)
2. No new issues found vs. previous round
3. Max rounds reached (default 5)

---

## Installation

### Prerequisites

- Node.js ≥ 18
- npm / pnpm
- `ffmpeg` (optional, for video frame extraction)

```bash
git clone https://github.com/your-org/testcase-generator
cd testcase-generator
npm install
npm run build
```

---

## OpenClaw Plugin Mode

### Install

```bash
# Link as local plugin (dev mode, hot-reload)
openclaw plugins install -l /path/to/testcase-generator

# Restart gateway
openclaw gateway restart

# Verify loaded
openclaw plugins list
```

### Configure in OpenClaw config

```yaml
# ~/.openclaw/config.yaml
plugins:
  load:
    paths:
      - /path/to/testcase-generator
  entries:
    testcase-generator:
      enabled: true
      config:
        models:
          - id: claude-gen
            vendor: anthropic
            model: claude-opus-4-5
            apiKey: "sk-ant-..."
            role: generator
          - id: gpt4o-rev
            vendor: openai
            model: gpt-4o
            apiKey: "sk-..."
            role: reviewer
          - id: deepseek-rev
            vendor: deepseek
            model: deepseek-chat
            apiKey: "sk-..."
            role: reviewer
        language: en
        enableReviewLoop: true
```

### Use commands

```
/testgen User login: phone+password, OAuth, lock after 5 failed attempts

/testgen /path/to/requirements.pdf --prompt focus on security

/testgen /path/to/ui-mockup.png
```

### Use as tool (agent auto-calls)

> "Generate test cases for the checkout flow: add to cart → payment → order confirmation"

The agent will automatically invoke the `generate_test_cases` tool.

---

## Standalone Web Mode

```bash
# Set environment variables
export ANTHROPIC_API_KEY=sk-ant-...
export OPENAI_API_KEY=sk-...
export DEEPSEEK_API_KEY=sk-...

# Start
npm run standalone

# Custom port
PORT=8080 npm run standalone
```

Open `http://localhost:3456` for the full Web UI.

---

## Deployment Methods

```bash
# npm global
npm install -g testcase-generator

# Local dev
npm run standalone

# Docker
docker compose up -d

# Universal installer (auto-detects best method)
chmod +x install.sh && ./install.sh

# Specific method
./install.sh --docker   # Docker Compose
./install.sh --npm      # npm global
./install.sh --apt      # apt + Node.js install (Debian/Ubuntu)
./install.sh --brew     # Homebrew (macOS)
```

### Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3456` | HTTP server port |
| `LANGUAGE` | `en` | Default language (`en` / `zh`) |
| `ENABLE_REVIEW` | `true` | Enable review loop |
| `REVIEW_THRESHOLD` | `90` | Score threshold to stop review |
| `MAX_REVIEW_ROUNDS` | `5` | Maximum review iterations |
| `OUTPUT_DIR` | `./testcase-output` | Directory for generated files |

---

## API Reference

### `POST /api/generate`

Multipart form upload.

| Field | Type | Description |
|-------|------|-------------|
| `text` | string | Requirement text |
| `files` | File[] | PDF / DOCX / TXT / image / video (max 20) |
| `prompt` | string | Custom focus hint |
| `stage` | string | `requirement` \| `development` \| `prerelease` |
| `language` | string | `en` \| `zh` |
| `enableReview` | string | `"true"` \| `"false"` |

**Supports SSE streaming**: pass `Accept: text/event-stream` to receive progress events in real time.

### `POST /api/refine`

Same fields as `/api/generate` plus:

| Field | Type | Description |
|-------|------|-------------|
| `sessionId` | string | Previous session ID |
| `editInstructions` | string | What to change, e.g. "Add performance tests" |

### `GET /api/download/excel/:sessionId`
### `GET /api/download/markdown/:sessionId`  
### `GET /api/download/xmind/:sessionId`

### `GET /api/stages?lang=en`

Returns stage definitions and check lists.

---

## Project Structure

```
testcase-generator/
├── SKILL.md                   ← OpenClaw skill descriptor
├── openclaw.plugin.json       ← OpenClaw plugin manifest
├── Dockerfile
├── docker-compose.yml
├── install.sh                 ← Universal installer
├── package.json
├── tsconfig.json
├── README.md
└── src/
    ├── index.ts               ← Plugin entry (register + CLI)
    ├── standalone.ts          ← Express HTTP server
    ├── types.ts               ← All types incl. ModelEntry, ReviewerPersona
    ├── ai-adapter.ts          ← Per-ModelEntry AI calls (Anthropic + OpenAI-compat)
    ├── generator.ts           ← Core generation logic (bilingual, stage-aware)
    ├── reviewer.ts            ← 3-persona review loop
    ├── prompts.ts             ← Stage prompt templates (written into code 🔥)
    ├── parser.ts              ← PDF / DOCX / image parsing
    ├── video-parser.ts        ← FFmpeg frame extraction
    ├── exporter.ts            ← Excel + Markdown + XMind export
    └── public/
        └── index.html         ← Full SPA (dark theme, bilingual EN/ZH)
```

---

## Extending with a new vendor

1. Add the vendor to `AIVendor` type in `types.ts`
2. Add its default base URL in `ai-adapter.ts → VENDOR_BASE_URLS`
3. Add its default model in `VENDOR_DEFAULT_MODELS`
4. If it's **not** OpenAI-compatible, add a case in `AIAdapter.complete()`

---

## License

MIT
