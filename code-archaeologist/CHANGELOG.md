# Changelog

## 0.1.0 — Initial release

- VSCode extension: right-click any line → explain
- Three commands: explain line, explain selection, explain function
- Hybrid architecture: deterministic git walk + LLM synthesis
- GitHub PR fetching (works unauthenticated for public repos, supports tokens)
- API key stored in OS keychain via VSCode SecretStorage
- CLI tool with the same core, for terminal usage and demos
- Confidence calibration on every explanation
- Citations to specific commit SHAs and PR numbers
