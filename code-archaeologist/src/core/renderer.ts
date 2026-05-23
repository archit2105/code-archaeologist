// Markdown rendering for the result. Shared between the VSCode webview and CLI.

import type { ArchaeologyResult } from "../types/index.js";

export function renderMarkdown(result: ArchaeologyResult): string {
  const { explanation: e, context: ctx } = result;
  const lines: string[] = [];

  lines.push(`### ${e.headline}`);
  lines.push(
    `<sub>Confidence: ${badge(e.confidence)} · ${result.elapsedMs}ms · ${ctx.commits.length} commit${ctx.commits.length === 1 ? "" : "s"}${ctx.pullRequests.length ? `, ${ctx.pullRequests.length} PR${ctx.pullRequests.length > 1 ? "s" : ""}` : ""}</sub>`
  );
  lines.push("");
  lines.push(`#### Why this code exists`);
  lines.push(e.why);
  lines.push("");

  if (e.timeline.length > 0) {
    lines.push(`#### Timeline`);
    for (const ev of e.timeline) {
      const refs: string[] = [];
      if (ev.sha) refs.push(commitLink(ev.sha, ctx));
      if (ev.prNumber) refs.push(prLink(ev.prNumber, ctx));
      lines.push(`- **${ev.when}** — ${ev.what}${refs.length ? ` · ${refs.join(" · ")}` : ""}`);
    }
    lines.push("");
  }

  if (e.notable.length > 0) {
    lines.push(`#### Notable`);
    e.notable.forEach((n) => lines.push(`- ${n}`));
    lines.push("");
  }

  if (e.unknown.length > 0) {
    lines.push(`#### What I couldn't determine`);
    e.unknown.forEach((u) => lines.push(`- ${u}`));
    lines.push("");
  }

  lines.push(`---`);
  lines.push(
    `<details><summary>Evidence (${ctx.commits.length} commit${ctx.commits.length !== 1 ? "s" : ""}${ctx.pullRequests.length ? `, ${ctx.pullRequests.length} PR${ctx.pullRequests.length > 1 ? "s" : ""}` : ""})</summary>`
  );
  lines.push("");
  for (const c of ctx.commits) {
    lines.push(`- ${commitLink(c.sha, ctx)} ${c.date.slice(0, 10)} — ${c.subject} _(${c.author})_`);
  }
  for (const pr of ctx.pullRequests) {
    lines.push(`- [PR #${pr.number}](${pr.url}) — ${pr.title} _(${pr.author})_`);
  }
  lines.push(``);
  lines.push(`</details>`);

  if (ctx.notes.length > 0) {
    lines.push(``);
    lines.push(`<details><summary>Notes</summary>`);
    lines.push(``);
    ctx.notes.forEach((n) => lines.push(`- ${n}`));
    lines.push(``);
    lines.push(`</details>`);
  }

  return lines.join("\n");
}

function badge(c: number): string {
  const pct = (c * 100).toFixed(0);
  if (c >= 0.85) return `🟢 High (${pct}%)`;
  if (c >= 0.6) return `🟡 Medium (${pct}%)`;
  if (c >= 0.3) return `🟠 Low (${pct}%)`;
  return `🔴 Speculative (${pct}%)`;
}

function commitLink(sha: string, ctx: ArchaeologyResult["context"]): string {
  const short = sha.slice(0, 7);
  if (!ctx.repoSlug) return `\`${short}\``;
  if (ctx.repoProvider === "github") {
    return `[\`${short}\`](https://github.com/${ctx.repoSlug}/commit/${sha})`;
  }
  if (ctx.repoProvider === "gitlab") {
    return `[\`${short}\`](https://gitlab.com/${ctx.repoSlug}/-/commit/${sha})`;
  }
  return `\`${short}\``;
}

function prLink(num: number, ctx: ArchaeologyResult["context"]): string {
  if (ctx.repoProvider === "github" && ctx.repoSlug) {
    return `[#${num}](https://github.com/${ctx.repoSlug}/pull/${num})`;
  }
  return `#${num}`;
}
