# LinkedIn launch posts

Three variants to A/B test. Pick the one that fits your voice best.

---

## Variant A — The pain story (longest, highest emotion)

Every developer has done this:

You find a weird piece of code.
You run `git blame`.
You see "John, 3 years ago, commit: 'fix bug'."
John left the company. The Slack thread is gone. The PR has 2 sentences.

You spend 2 hours figuring out why the code exists.

By which point you're afraid to touch it.

I got tired of this. So I built Code Archaeologist:

→ Right-click any line in VSCode
→ It walks the git history, follows linked PRs, reads commit bodies
→ Synthesizes the "why" with citations to specific commits and PRs
→ Tells you when it doesn't know (instead of inventing)

Tested on the Linux kernel source. It found the original 2015 mailing-list discussion behind a single line of code in 8 seconds.

The architecture is deliberately boring:
- Deterministic git walk (not RAG, not embeddings)
- Public GitHub API for PRs (no auth needed for public repos)
- One synthesis call to Claude
- Confidence score on every answer

No SaaS. No vendor lock-in. Pay Anthropic directly — pennies per query.

Repo is free + MIT. Comment "ARCHAEOLOGY" and I'll DM you.

If your team has ever lost context on production code, repost this.

---

## Variant B — The technical hook (shorter, dev-focused)

Built a VSCode extension that does what `git blame` should have done from day one.

`git blame` tells you WHO touched a line.
GitLens tells you WHAT changed.
Neither tells you WHY the code exists.

So I built Code Archaeologist. Right-click any line:

1. It blames the line, then walks back through the commit history
2. Parses commit messages for PR references (#1234, JIRA tickets, URLs)
3. Fetches each PR via GitHub's public API (works without auth)
4. Sends everything to Claude with a focused synthesis prompt
5. Returns a structured explanation with citations + confidence score

The "confidence score" is the part I'm most proud of:
- 0.9+ means clear evidence, multiple corroborating sources
- 0.3-0.5 means best guess, significant gaps
- Below 0.3 means mostly speculation — flagged for the user

And it has an `unknown` field. When the model can't determine something, it admits it instead of making things up.

No RAG. No embeddings. No vector database. The whole thing is ~1500 lines of TypeScript.

Repo: [link]
Free + MIT.

Comment "ARCHAEOLOGY" if you want a walkthrough.

---

## Variant C — The contrarian angle (shortest, sharpest)

Every AI code tool I've seen has the same flaw: it answers EVERY question with the same confidence.

That's the bug.

A senior engineer doesn't pretend to know everything. They say "this code looks like it does X, but I'd want to check the PR to be sure."

So I built a code-explanation tool that does the same:

→ Walks your git history before answering
→ Cites specific commits and PRs for every claim
→ Calibrates its own confidence (high/medium/low/speculative)
→ Has an "I don't know" field for things it can't determine

Right-click any line of code in VSCode. Get the forensic "why."

No hallucinations dressed up as facts.

Free + MIT: [link]

Comment "ARCHAEOLOGY" for the repo.

---

## Visual asset notes

For maximum LinkedIn pull, attach a screen recording showing:

1. **Cold open (3 seconds):** A real codebase open in VSCode. Cursor on a weird line. The viewer's reaction: "what does this do?"
2. **The action (2 seconds):** Right-click → "Code Archaeologist: Explain this line"
3. **The payoff (10 seconds):** Result panel slides in. Headline appears. Timeline scrolls. Confidence badge visible. PR links highlighted.
4. **The kicker (3 seconds):** Click a PR link in the result. Browser opens to the real PR from 2 years ago. Caption: "and it shows you the receipts."

Total: 18 seconds. Loop it.

Repos that work well as demo material (real history, public, well-known):
- The Linux kernel — `git clone https://github.com/torvalds/linux` (huge but slow)
- React — `git clone https://github.com/facebook/react`
- VSCode itself — `git clone https://github.com/microsoft/vscode`
- TypeScript — `git clone https://github.com/microsoft/TypeScript`

Pick a juicy file with interesting history. `src/compiler/checker.ts` in TypeScript is gold.

---

## What to do AFTER the post lands

If it pops:
1. Star count on the repo will spike — make sure README is polished BEFORE posting
2. People will DM asking how it works — have a 1-minute Loom ready
3. People will ask "does it work with [other IDE]?" — note that VSCode-API-compatible IDEs (Cursor, Windsurf) should work as-is
4. The first 20 issues will be the same 3 questions — pin a FAQ to the repo

If it doesn't pop:
- Reuse the demo video in 1-2 weeks with a different angle
- Post the technical deep-dive separately ("how Claude + git made this possible")
- Try the inverse framing: "we don't need AI to write code. We need AI to UNDERSTAND code."
