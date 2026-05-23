# Code Archaeologist 🏺

> Right-click any line of code → know exactly why it exists.

Every developer has done this:

You find a weird piece of code. You run `git blame`. You see _"John, 3 years ago, commit message: 'fix bug'."_ John left the company. The Slack thread is gone. The PR has 2 sentences.

You spend 2 hours figuring out why the code exists, by which point you're afraid to touch it.

**Code Archaeologist does the archaeology for you.** Point at any line — it walks the commit history, follows linked PRs, reads commit bodies for references, and produces a forensic "why does this exist" with citations.

## What it looks like

Right-click a line in VSCode → **Code Archaeologist: Explain this line** → you get:

```
### Switched from MD5 to bcrypt for password hashing
Confidence: 🟢 High (87%) · 2,341ms · 4 commits, 2 PRs

#### Why this code exists
MD5 was flagged as insecure in security review (PR #1893). The team migrated
to bcrypt in commit a3f9c21 to align with OWASP password-storage guidance and
slow brute-force attacks against leaked databases. Existing MD5 hashes were
kept valid until next login to avoid a forced password reset.

#### Timeline
- Mar 2018 — Initial MD5 implementation · a1b2c3d
- Aug 2021 — Security review flagged MD5 as deprecated · PR #1893
- Sep 2021 — Migrated to bcrypt with lazy rehash on login · a3f9c21 · #1902
- Nov 2022 — Removed final MD5 fallback after 1 year · c8d9e0f

#### Notable
- The migration deliberately avoided forced password reset, a design choice
  debated in the PR comments by reviewers Alice and Bob.

#### What I couldn't determine
- Whether Argon2 was considered as an alternative to bcrypt.
```

## Install

### VSCode extension

> Coming to the Marketplace soon. For now: install from source (below).

### CLI

```bash
npm install -g code-archaeologist
export ANTHROPIC_API_KEY=sk-ant-...
code-archaeologist src/auth.ts:42
```

## How it works

**Hybrid: deterministic git walk + LLM synthesis.** Not RAG, not embeddings, no vector database. Here's what actually happens when you trigger an explanation:

```
Right-click line 42
       │
       ▼
1. git blame -L 42,42       ─→ which commits touched this line?
2. git log for each commit  ─→ full subjects, bodies, file changes
3. parse commit messages    ─→ extract PR refs (#1234), JIRA, URLs
4. fetch each PR via GitHub ─→ description + top comments (public API)
5. git log on the file      ─→ broader context: how old, how many authors
       │
       ▼
6. Send all of the above to Claude with a focused synthesis prompt
       │
       ▼
7. Render result with citations, confidence score, and links
```

The architecture is deliberately boring. The interesting AI work is the synthesis step — and the synthesis is grounded in real evidence from steps 1-5, not in the model's general knowledge.

**Why this beats "just ask ChatGPT about this code":**

- It knows _your_ commit history, not just public training data
- Claims are tied to specific SHAs and PRs you can click through to
- The confidence score is honest — low-evidence answers are flagged as such
- It admits what it doesn't know (a separate `unknown` field) instead of confabulating

## Install from source

```bash
git clone https://github.com/your-username/code-archaeologist
cd code-archaeologist
npm install

# Build the extension
npm run build

# Test it: open this folder in VSCode, press F5 → opens an Extension Development Host
# Then right-click any line in any file

# Or use the CLI
npm run dev:cli -- src/types/index.ts:42
```

To install the built extension into your real VSCode:

```bash
npm run package          # produces code-archaeologist-0.1.0.vsix
code --install-extension code-archaeologist-0.1.0.vsix
```

## Configuration

All optional. Sensible defaults work for most repos.

| Setting | Default | What |
|---|---|---|
| `codeArchaeologist.anthropicApiKey` | (prompted) | Your Anthropic key. Stored in OS keychain, never in settings.json. |
| `codeArchaeologist.model` | `claude-opus-4-7` | Opus = best, Haiku = fastest/cheapest, Sonnet = balanced. |
| `codeArchaeologist.maxCommitsToWalk` | `20` | Cap on commits per query. Lower = faster + cheaper. |
| `codeArchaeologist.includeFileHistory` | `true` | Also include the file's broader history (not just the line). |
| `codeArchaeologist.followFileRenames` | `true` | Follow `git log --follow` through renames. |
| `codeArchaeologist.fetchGitHubPRs` | `true` | Fetch linked PRs from GitHub. Works without a token (60 req/hour). |
| `codeArchaeologist.githubToken` | (empty) | Optional GitHub token for 5000 req/hour and private repos. |

## What it costs

Per explanation:
- **Opus 4.7:** roughly $0.02–$0.08 depending on commit history depth
- **Sonnet 4.6:** roughly $0.005–$0.02
- **Haiku 4.5:** roughly $0.001–$0.005

For most teams: pennies per query. For huge codebases with deep history: still well under a dollar per query. No subscription, no SaaS markup — you pay Anthropic directly.

## Why not just use `git blame` or GitLens?

| | git blame | GitLens | Code Archaeologist |
|---|---|---|---|
| Who touched the line | ✅ | ✅ | ✅ |
| Commit message | ✅ | ✅ | ✅ |
| Linked PR description + comments | ❌ | partial | ✅ |
| Synthesizes _why_ across multiple commits | ❌ | ❌ | ✅ |
| Confidence calibration | ❌ | ❌ | ✅ |
| Admits gaps in evidence | ❌ | ❌ | ✅ |

`git blame` tells you _who_. GitLens tells you _what_. Code Archaeologist tells you _why_.

## Privacy

- **Code never leaves your machine except via your Anthropic API key.** No third-party telemetry, no analytics, no cloud component.
- **Your API key is stored in VSCode's encrypted SecretStorage** (backed by OS keychain), not in `settings.json`.
- **GitHub API calls** use public endpoints; with a token, they're authenticated as you.
- The extension reads your local git history. It does not write to your repo.

## Roadmap

- [x] VSCode extension with right-click
- [x] CLI tool with the same core
- [x] GitHub PR fetching (unauth + authenticated)
- [ ] GitLab merge request fetching
- [ ] Linear / Jira ticket fetching (via user-provided tokens)
- [ ] "Explain this function" using VSCode's symbol provider (currently falls back to line)
- [ ] Hover preview (lightweight one-line explanation on hover)
- [ ] Cursor IDE support (should work as-is via VSCode compat)
- [ ] Bulk mode: explain every TODO/FIXME in a repo

## Contributing

PRs welcome. The codebase is small and intentionally boring:

```
src/
├── types/        Schemas + TS types
├── git/          git CLI wrappers (blame, history, GitHub API)
├── core/         Archaeologist (gather) + Explain (orchestrate) + Renderer
├── llm/          Anthropic client + synthesis prompt
├── extension/    VSCode-specific code (commands, panels, secrets)
└── cli/          CLI wrapper around core/explain
```

The `core/` and `git/` and `llm/` directories have zero VSCode dependencies — they're reusable. The `extension/` directory is the only VSCode-aware code.

## License

MIT.

---

_Built because every dev has spent too long figuring out why a line of code exists. Now you don't have to._
