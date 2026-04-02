# testcase-generator

AI-powered test case generator for OpenClaw and standalone web usage, with a three-persona review loop:

- Test Manager
- Dev Manager
- Product Manager

Supported input types:

- PDF
- Word
- TXT
- Images
- Video

Supported run modes:

- Local source run
- OpenClaw plugin
- npm global install
- Docker

## Quick Start

### Local source run

```bash
git clone https://github.com/XuXuClassMate/testcase-generator.git
cd testcase-generator
npm install
cp .env.example .env
```

Edit `.env` and fill at least one API key:

```bash
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
LANGUAGE=en
ENABLE_REVIEW=true
REVIEW_THRESHOLD=90
MAX_REVIEW_ROUNDS=5
PORT=3456
OUTPUT_DIR=./testcase-output
```

Then start the standalone web UI:

```bash
npm run build
npm run start
```

Open [http://localhost:3456](http://localhost:3456).

### npm global install

```bash
npm install -g @classmatexuxu/testcase-generator

export AI_PROVIDER=anthropic
export ANTHROPIC_API_KEY=sk-ant-...
export PORT=3456

testcase-generator --standalone
```

### Docker Compose

```bash
cp .env.example .env
```

Fill in your API keys in `.env`, then run:

```bash
docker compose up -d --build
```

Stop it with:

```bash
docker compose down
```

### Docker run

```bash
docker build -t testcase-generator:local .

docker run -d \
  --name testcase-generator \
  -p 3456:3456 \
  -e AI_PROVIDER=anthropic \
  -e ANTHROPIC_API_KEY=sk-ant-... \
  -e LANGUAGE=en \
  -e ENABLE_REVIEW=true \
  -e REVIEW_THRESHOLD=90 \
  -e MAX_REVIEW_ROUNDS=5 \
  -e OUTPUT_DIR=/data/testcase-output \
  -v testcase-generator-data:/data/testcase-output \
  testcase-generator:local
```

### OpenClaw plugin

Install the repo as a local plugin:

```bash
openclaw plugins install -l /path/to/testcase-generator
openclaw gateway restart
openclaw plugins list
```

Then configure `models[]` in your OpenClaw config. A full example lives in [docs/README.md](/Users/xuxuclassmate/Documents/testcase-generator/docs/README.md).

## Notes

- For local, npm, and Docker standalone mode, the page language controls both generation language and exported file language.
- The npm package name is `@classmatexuxu/testcase-generator`, while the installed CLI command remains `testcase-generator`.
- For OpenClaw mode, the recommended approach is configuring `models[]` in plugin config instead of relying on env vars.
- If you configure only one model, set its role to `both`.
- Detailed setup and configuration docs live in [docs/README.md](/Users/xuxuclassmate/Documents/testcase-generator/docs/README.md).

## Release Automation

GitHub Actions currently automates:

- npm publishing
- Docker Hub publishing
- GHCR publishing
- GitHub Releases asset publishing
- free code scanning and dependency/security checks on merges to `main`

Release publishing is triggered by pushing a tag like `v1.0.0`, and the tag must match `package.json`'s version.

## Repository

- GitHub: https://github.com/XuXuClassMate/testcase-generator
