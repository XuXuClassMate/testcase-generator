# @classmatexuxu/testcase-generator

AI-powered test case generation for PRDs, specifications, and multimodal QA inputs.

## Install

```bash
npm install -g @classmatexuxu/testcase-generator
```

## Quick Start

Set at least one provider API key before first run:

```bash
export AI_PROVIDER=anthropic
export ANTHROPIC_API_KEY=sk-ant-...
export LANGUAGE=en
export PORT=3456
export OUTPUT_DIR=./testcase-output
```

Start the standalone web UI:

```bash
testcase-generator --standalone
```

Open `http://localhost:3456`.

## Environment Variables

| Variable | Default | Description |
| --- | --- | --- |
| `AI_PROVIDER` | `anthropic` | Primary provider for env-based startup (`anthropic` \| `openai` \| `deepseek`) |
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

The page language controls both the generated content language and the exported file language.

## Links

- GitHub: https://github.com/XuXuClassMate/testcase-generator
- Releases: https://github.com/XuXuClassMate/testcase-generator/releases
- Detailed docs: https://github.com/XuXuClassMate/testcase-generator/blob/main/docs/README.md
