# Security Information

## 🔍 VirusTotal Scanning Notice

**Status:** ⚠️ Some vendors may flag this project as "Suspicious" - This is a **FALSE POSITIVE**

### Why VirusTotal May Flag This Project

This project uses several legitimate patterns that heuristic scanners sometimes misidentify:

| Pattern | Why It Triggers | Actual Purpose |
|---------|-----------------|----------------|
| Multiple AI SDKs (`@anthropic-ai/sdk`, `openai`) | Resembles "multi-stage downloader" | Supports multiple AI providers (Claude, GPT, DeepSeek, Qwen, etc.) |
| HTTP server (`express` + `cors`) | Looks like "command & control server" | Provides standalone web UI for test case generation |
| File upload handling (`multer`) | Flagged as "data exfiltration risk" | Accepts PDF, DOCX, images for analysis |
| Dynamic API endpoint routing | Matches "C2 communication" patterns | Routes requests to different AI vendor APIs |
| Compiled JavaScript (`dist/`) | Obfuscated code detection | TypeScript build output |

### Project Verification

✅ **Open Source** - Full source code available at: https://github.com/XuXuClassMate/testcase-generator

✅ **Official Dependencies** - All npm packages are from verified publishers:
- `@anthropic-ai/sdk` - Anthropic official SDK
- `openai` - OpenAI official SDK
- `express`, `multer`, `cors` - Standard Node.js ecosystem packages

✅ **No Malicious Behavior**:
- No system command execution
- No file system writes outside output directory
- No network calls except to documented AI vendor APIs
- No data collection or telemetry

### For Security Teams

If you are evaluating this project for enterprise use:

1. **Review source code** - All code is auditable on GitHub
2. **Check dependencies** - Run `npm audit` for vulnerability scan
3. **Sandbox testing** - Deploy in isolated environment first
4. **Network monitoring** - All outbound calls go to documented AI vendor endpoints only

### Reporting Security Issues

If you find a genuine security vulnerability, please report it responsibly:

1. **DO NOT** open a public issue
2. GitHub Issues: https://github.com/XuXuClassMate/testcase-generator/issues
3. GitHub Security Advisories: https://github.com/XuXuClassMate/testcase-generator/security/advisories

### False Positive Appeals

If VirusTotal flags this project:

1. **Submit to VirusTotal** - https://www.virustotal.com/gui/contact-upload
2. **Reference this document** - Link to this SECURITY.md
3. **Include project URL** - https://github.com/XuXuClassMate/testcase-generator

---

**Last Updated:** 2026-04-03
**Package:** @classmatexuxu/testcase-generator
**Current Version:** 10.0.3
