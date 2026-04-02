---
name: ai-testcase-generator
version: 1.0.0
description: Generate high-quality test cases from requirements using AI with multi-model review
author: XuXuClassMate
tags: [testing, qa, testcases, requirements]
---

# AI Test Case Generator Skill

## What this skill does

Automatically generates structured test cases from requirement documents, UI screenshots, videos, or plain text. Supports a multi-model review loop where **Test Manager**, **Dev Manager**, and **Product Manager** personas review and score the output iteratively until quality ≥ 90/100.

## Trigger phrases

Use this skill when the user says anything like:

- "generate test cases for …"
- "write test cases / QA cases / test suite for …"
- "create test plan from this requirement"
- "review my test cases"
- "需求评审 / 测试用例 / 生成用例"
- Uploads a `.pdf`, `.docx`, `.txt`, image, or video file and asks about testing

## Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `text` | string | — | Requirement description text |
| `file_path` | string | — | Path to uploaded requirement file |
| `prompt` | string | — | Custom focus hint, e.g. "focus on security" |
| `stage` | enum | `development` | `requirement` \| `development` \| `prerelease` |
| `language` | enum | `en` | `en` \| `zh` |
| `enable_review` | boolean | `true` | Run multi-model review loop |

## Output

Returns a Markdown-formatted test case report including:
- Test points grouped by module
- Full test cases with ID, steps, expected results, priority
- Quality score (0–100) after review loop
- Review comments from 3 reviewer personas

Also saves:
- `.xlsx` — Excel test suite (3 sheets: cases / points / stats)
- `.xmind` — XMind mind map of test points
- `.md` — Markdown report

## Example invocations

```
Generate test cases for user login:
- Phone + password login
- OAuth (GitHub, Google)
- Lock account after 5 failed attempts
- Remember me (7-day token)
```

```
/testgen /uploads/requirements.pdf --prompt focus on edge cases and security
```

```
Generate Chinese test cases for the pre-release stage from this PRD
[attaches file]
```

## Review loop scoring (100 pts)

| Dimension | Max | Reviewer Focus |
|-----------|-----|----------------|
| Coverage | 30 | Test Manager |
| Logic Integrity | 20 | Dev Manager |
| Executability | 20 | Test Manager |
| Clarity | 15 | Product Manager |
| Security | 15 | Dev Manager |

Terminates when: score ≥ 90 · OR · no new issues · OR · 5 rounds max
