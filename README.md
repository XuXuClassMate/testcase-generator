# testcase-generator

AI-powered test case generator for OpenClaw, with a three-persona review loop:

- Test Manager
- Dev Manager
- Product Manager

It can run in two modes:

- OpenClaw plugin
- Standalone web service

Supported inputs include PDF, Word, TXT, images, and video. Outputs include Excel, Markdown, and XMind.

## Quick Start

```bash
git clone https://github.com/XuXuClassMate/testcase-generator.git
cd testcase-generator
npm install
cp .env.example .env
npm run build
npm run start
```

Standalone mode listens on `http://localhost:3456` by default.

## Environment Variables

For quick local startup, you can use environment variables:

```bash
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=your_key_here
LANGUAGE=en
ENABLE_REVIEW=true
REVIEW_THRESHOLD=90
MAX_REVIEW_ROUNDS=5
PORT=3456
OUTPUT_DIR=./testcase-output
```

For OpenClaw plugin mode, the recommended approach is configuring `models[]` in the plugin config instead of relying on env vars.

## Scripts

```bash
npm run build
npm run typecheck
npm run dev:standalone
npm run start
```

## Project Notes

- Detailed product and configuration documentation lives in `docs/README.md`.
- The skill-oriented reference lives in `docs/skill.md`.
- The standalone UI supports generation, iterative refinement, download, and review visualization.
- If you configure only one model, set its role to `both` so it can generate and self-review.
- Docker files now live at the repository root, and the installer script lives in `scripts/install.sh`.

## Structure

```text
testcase-generator/
├── README.md
├── docs/
├── public/
├── scripts/
├── src/
├── Dockerfile
├── docker-compose.yml
└── package.json
```

## Release Automation


Release publishing is triggered by pushing a tag like `v1.0.0`, and the tag must match `package.json`'s version.

## Repository

- GitHub: https://github.com/XuXuClassMate/testcase-generator
