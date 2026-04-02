# testcase-generator

<div align="center">

**AI-powered test case generation for PRDs, specifications, and multimodal QA inputs**

[![Version](https://img.shields.io/github/v/release/XuXuClassMate/testcase-generator?label=version)](https://github.com/XuXuClassMate/testcase-generator/releases)
[![Docker Pulls](https://img.shields.io/docker/pulls/xuxuclassmate/testcase-generator)](https://hub.docker.com/r/xuxuclassmate/testcase-generator)
[![npm](https://img.shields.io/npm/v/%40classmatexuxu%2Ftestcase-generator?label=npm)](https://www.npmjs.com/package/@classmatexuxu/testcase-generator)

[GitHub](https://github.com/XuXuClassMate/testcase-generator) • [Docker Hub](https://hub.docker.com/r/xuxuclassmate/testcase-generator) • [npm](https://www.npmjs.com/package/@classmatexuxu/testcase-generator) • [Detailed Docs](./docs/README.md)

</div>

---

## What It Does

Testcase Generator turns requirement documents and multimodal inputs into structured QA deliverables.

- Accepts PDF, Word, TXT, images, and video
- Runs a three-persona review loop:
  Test Manager
  Dev Manager
  Product Manager
- Exports Excel, Markdown, and XMind
- Supports English and Chinese output
- Runs in four supported modes:
  Docker
  Local source run
  npm global install
  OpenClaw plugin

## Docker Quick Start

### 1. Pull the image

```bash
docker pull xuxuclassmate/testcase-generator:latest
```

### 2. Prepare your environment file

```bash
curl -O https://raw.githubusercontent.com/XuXuClassMate/testcase-generator/main/.env.example
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

### 3. Run the container

```bash
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
  -v testcase-generator-output:/data/testcase-output \
  xuxuclassmate/testcase-generator:latest
```

Open [http://localhost:3456](http://localhost:3456).

### 4. Useful container commands

```bash
docker logs -f testcase-generator
docker stop testcase-generator
docker rm testcase-generator
```

## Docker Compose

If you are running from the repository source:

```bash
git clone https://github.com/XuXuClassMate/testcase-generator.git
cd testcase-generator
cp .env.example .env
docker compose up -d --build
```

Stop it with:

```bash
docker compose down
```

## Environment Variables

| Variable | Default | Description |
| --- | --- | --- |
| `AI_PROVIDER` | `anthropic` | Primary provider for env-based standalone startup |
| `ANTHROPIC_API_KEY` | empty | Anthropic API key |
| `OPENAI_API_KEY` | empty | OpenAI API key |
| `DEEPSEEK_API_KEY` | empty | DeepSeek API key |
| `LANGUAGE` | `en` | UI, generation, and export language (`en` or `zh`) |
| `ENABLE_REVIEW` | `true` | Enable reviewer loop |
| `REVIEW_THRESHOLD` | `90` | Minimum review score before stopping |
| `MAX_REVIEW_ROUNDS` | `5` | Maximum review iterations |
| `PORT` | `3456` | Standalone web server port |
| `OUTPUT_DIR` | `./testcase-output` | Output directory for generated files |

## Outputs

Generated sessions can export:

- Excel
- Markdown
- XMind

The page language controls both the generated content language and the exported file language in standalone mode.

## Alternative Run Modes

### npm global install

```bash
npm install -g @classmatexuxu/testcase-generator

export AI_PROVIDER=anthropic
export ANTHROPIC_API_KEY=sk-ant-...
export PORT=3456

testcase-generator --standalone
```

### Local source run

```bash
git clone https://github.com/XuXuClassMate/testcase-generator.git
cd testcase-generator
npm install
cp .env.example .env
npm run build
npm run start
```

### OpenClaw plugin

```bash
openclaw plugins install -l /path/to/testcase-generator
openclaw gateway restart
openclaw plugins list
```

Then configure `models[]` in your OpenClaw config. A full example lives in [docs/README.md](./docs/README.md).

## Release and Distribution

GitHub Actions currently automates:

- npm publishing
- npm package README publishing from `docs/npm-readme.md`
- Docker Hub publishing
- GHCR publishing
- Docker Hub overview sync from `docs/dockerhub-overview.md`
- GitHub Releases asset publishing
- free code scanning and dependency/security checks on merges to `main`

Release publishing is triggered by pushing a tag like `v1.0.0`, and the tag must match `package.json`'s version.

## Links

- GitHub: https://github.com/XuXuClassMate/testcase-generator
- Docker Hub: https://hub.docker.com/r/xuxuclassmate/testcase-generator
- npm: https://www.npmjs.com/package/@classmatexuxu/testcase-generator
- Releases: https://github.com/XuXuClassMate/testcase-generator/releases
- Detailed docs: [docs/README.md](./docs/README.md)
