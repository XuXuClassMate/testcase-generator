# AI Test Case Generator Skill

## Description
Generates high-quality test cases from requirements documents, UI screenshots, or plain text.
Supports multi-model review loop with automated quality scoring.

## When to use this skill
- User says: "generate test cases", "write test cases", "create QA test suite"
- User uploads a requirements document, PRD, or UI screenshot
- User says: "review my test cases", "score these test cases"
- User asks for testing at a specific stage: "requirement review", "before release", "handoff testing"

## Capabilities
- Input: PDF, Word, TXT, images (OCR), video (frame extraction)
- Output: Markdown test points + Excel test suite
- Multi-model review loop: auto-scores and refines until quality ≥ 90/100
- Bilingual: Chinese (zh) and English (en)
- Three stages: requirement / development / prerelease

## Scoring Dimensions (100 points total)
- Coverage: 30 pts
- Logic Integrity: 20 pts
- Executability: 20 pts
- Clarity: 15 pts
- Security: 15 pts

## Usage examples
- "Generate test cases for this login requirement: [text]"
- "Upload req.pdf and generate test cases, focus on security"
- "Generate test cases in Chinese for the pre-release stage"

## Output format
Returns Markdown by default. Excel available via download link.
Includes quality score and review round details when review loop is enabled.
