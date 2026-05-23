// Turns gathered evidence into a structured Explanation.
//
// The prompt does most of the work here. Two non-obvious choices:
//   - past tense, forensic voice — it's a record, not a tutorial
//   - explicit `unknown` and `confidence` fields — model is allowed to admit gaps

import { ExplanationSchema, type ArchaeologyContext } from "../types/index.js";
import { AnthropicClient } from "./client.js";

export interface SynthesizeOptions {
  client: AnthropicClient;
  context: ArchaeologyContext;
}

export async function synthesize(opts: SynthesizeOptions) {
  const { data, usage } = await opts.client.completeJSON({
    system: SYSTEM,
    user: buildUserPrompt(opts.context),
    schema: ExplanationSchema,
    maxTokens: 2048,
  });
  return { explanation: data, usage };
}

const SYSTEM = `You are Code Archaeologist — a forensic explainer of code history.

Your job: given a snippet of code and its git history (blame, commits, PRs), explain WHY this code exists. You are an investigator, not a tutor.

PRINCIPLES:
- Ground every claim in the evidence. Cite commit SHAs (first 7 chars) or PR numbers.
- "I don't know" is a valid answer. Put gaps in the 'unknown' field rather than inventing.
- Be specific. "Refactored for performance" is useless. "Switched from O(n²) to O(n log n) via binary search (commit a3f9c21)" is the bar.
- Past tense. This is a record.
- Plain language. No filler. No "this code is interesting because…" preambles.

FIELDS:
- headline: ONE sentence. What the code does AND why it exists.
- why: 2-4 sentences. The forensic explanation, grounded in evidence.
- timeline: 2-5 important moments. Skip routine maintenance.
- notable: surprising findings, or [] if nothing surprising.
- unknown: what you cannot determine, or [] if everything is clear.
- confidence: 0-1, honestly self-assessed.

CONFIDENCE CALIBRATION:
- 0.9+ = clear evidence, multiple corroborating sources
- 0.6-0.8 = reasonable inference from available evidence
- 0.3-0.5 = best guess; significant gaps
- <0.3 = mostly speculation

If you only have one commit with "fix bug" and no PR, that's around 0.3.
If you have multiple commits, a PR description, and reviewer comments discussing tradeoffs, you can hit 0.85+.
If the code is brand new (one commit by current author yesterday), say so in 'unknown' and keep confidence low.`;

function buildUserPrompt(ctx: ArchaeologyContext): string {
  const parts: string[] = [];

  parts.push(`# The code in question

**File:** \`${ctx.query.relativePath}\`
**Lines:** ${ctx.query.startLine}${ctx.query.endLine !== ctx.query.startLine ? `–${ctx.query.endLine}` : ""}
**Language:** ${ctx.query.language}

\`\`\`${ctx.query.language}
${ctx.query.codeSnippet}
\`\`\`

## Surrounding context

\`\`\`${ctx.query.language}
${ctx.query.surroundingContext}
\`\`\``);

  if (ctx.blameChain.length > 0) {
    const unique = Array.from(new Map(ctx.blameChain.map((b) => [b.commitSha, b])).values());
    parts.push(`# Git blame

Last touched by ${unique.length} unique commit${unique.length > 1 ? "s" : ""}:

${unique
  .map((b, i) => `${i + 1}. \`${b.commitSha.slice(0, 7)}\` by ${b.author} on ${b.authorDate.slice(0, 10)} — ${b.summary}`)
  .join("\n")}`);
  } else {
    parts.push(`# Git blame\n\n(No blame results — line may be uncommitted.)`);
  }

  if (ctx.commits.length > 0) {
    parts.push(`# Commit details

${ctx.commits
  .map((c) => {
    const refs = c.references.length
      ? `\n  References: ${c.references.map((r) => `${r.kind}:${r.value}`).join(", ")}`
      : "";
    const stats =
      c.files.length > 1
        ? `\n  Touched ${c.files.length} files (+${c.files.reduce((s, f) => s + f.insertions, 0)}/-${c.files.reduce((s, f) => s + f.deletions, 0)})`
        : "";
    return `## \`${c.shortSha}\` — ${c.subject}
By: ${c.author} on ${c.date.slice(0, 10)}${refs}${stats}

${c.body || "_(no commit body)_"}`;
  })
  .join("\n\n")}`);
  }

  if (ctx.fileHistory.totalCommits > 0) {
    parts.push(`# File history

- Total commits to this file: ${ctx.fileHistory.totalCommits}
- Distinct authors: ${ctx.fileHistory.authorCount}
${ctx.fileHistory.firstCommit
      ? `- First introduced: ${ctx.fileHistory.firstCommit.date.slice(0, 10)} by ${ctx.fileHistory.firstCommit.author} (\`${ctx.fileHistory.firstCommit.shortSha}\` — ${ctx.fileHistory.firstCommit.subject})`
      : ""}

Recent commits:
${ctx.fileHistory.recentCommits.slice(0, 5)
  .map((c) => `- \`${c.shortSha}\` ${c.date.slice(0, 10)} ${c.subject}`)
  .join("\n")}`);
  }

  if (ctx.pullRequests.length > 0) {
    parts.push(`# Linked PRs

${ctx.pullRequests
  .map((pr) => {
    const comments = pr.comments.length
      ? `\n\nTop comments:\n${pr.comments.slice(0, 4)
          .map((c) => `> **${c.author}**: ${oneline(c.body, 300)}`)
          .join("\n\n")}`
      : "";
    return `## PR #${pr.number} — ${pr.title}
By: ${pr.author} | State: ${pr.state}${pr.mergedAt ? ` (merged ${pr.mergedAt.slice(0, 10)})` : ""}
URL: ${pr.url}

${pr.body || "_(no description)_"}${comments}`;
  })
  .join("\n\n")}`);
  }

  if (ctx.notes.length > 0) {
    parts.push(`# Notes from the gatherer\n${ctx.notes.map((n) => `- ${n}`).join("\n")}`);
  }

  parts.push(`---

Now produce the JSON. Cite SHAs and PR numbers. Admit what you don't know. Calibrate confidence honestly.`);

  return parts.join("\n\n");
}

function oneline(s: string, n: number) {
  const c = s.replace(/\s+/g, " ").trim();
  return c.length > n ? c.slice(0, n) + "…" : c;
}
