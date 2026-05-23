// Commit/file history readers, plus reference extraction from commit messages.

import { runGit } from "./runner.js";
import type { CommitInfo } from "../types/index.js";

// ASCII RS + US — extremely unlikely to appear in commit text, so safe as
// delimiters. %b is the only field that can contain newlines, so we put it last
// and rely on the trailing RS to terminate the block.
const RS = "\x1e";
const US = "\x1f";
const FORMAT = `${RS}%H${US}%h${US}%an${US}%ae${US}%aI${US}%s${US}%b${US}`;

export async function getCommit(repoRoot: string, sha: string): Promise<CommitInfo> {
  const out = await runGit(["log", "-1", `--format=${FORMAT}`, "--numstat", sha], {
    cwd: repoRoot,
  });
  const commits = parseLog(out);
  if (!commits[0]) throw new Error(`Commit not found: ${sha}`);
  return commits[0];
}

export interface FileHistoryOptions {
  repoRoot: string;
  filePath: string;
  limit: number;
  followRenames?: boolean;
}

export async function getFileHistory(opts: FileHistoryOptions): Promise<{
  commits: CommitInfo[];
  totalCount: number;
  firstCommit?: CommitInfo;
}> {
  const args = ["log", `--max-count=${opts.limit}`, `--format=${FORMAT}`, "--numstat"];
  if (opts.followRenames) args.push("--follow");
  args.push("--", opts.filePath);

  const commits = parseLog(await runGit(args, { cwd: opts.repoRoot }));

  // total count — separate call because --follow + --max-count don't play nice
  let totalCount = commits.length;
  try {
    const args2 = ["rev-list", "--count"];
    if (opts.followRenames) args2.push("--follow");
    args2.push("HEAD", "--", opts.filePath);
    totalCount = parseInt((await runGit(args2, { cwd: opts.repoRoot })).trim(), 10) || commits.length;
  } catch {
    // older git versions can choke on --follow with rev-list; not fatal
  }

  // first commit (when the file was added)
  let firstCommit: CommitInfo | undefined;
  try {
    const args3 = ["log", "--diff-filter=A", `--format=${FORMAT}`, "--numstat"];
    if (opts.followRenames) args3.push("--follow");
    args3.push("--", opts.filePath);
    const all = parseLog(await runGit(args3, { cwd: opts.repoRoot }));
    firstCommit = all[all.length - 1];
  } catch {
    // ignore
  }

  return { commits, totalCount, firstCommit };
}

export async function getFileAuthorCount(
  repoRoot: string,
  filePath: string,
  followRenames: boolean
): Promise<number> {
  try {
    const args = ["log", "--format=%ae"];
    if (followRenames) args.push("--follow");
    args.push("--", filePath);
    const out = await runGit(args, { cwd: repoRoot });
    return new Set(out.trim().split("\n").filter(Boolean)).size;
  } catch {
    return 0;
  }
}

function parseLog(raw: string): CommitInfo[] {
  if (!raw.trim()) return [];
  const blocks = raw.split(RS).filter((b) => b.trim());
  const out: CommitInfo[] = [];

  for (const block of blocks) {
    const nl = block.indexOf("\n");
    const head = nl === -1 ? block : block.slice(0, nl);
    const numstat = nl === -1 ? "" : block.slice(nl + 1);

    const fields = head.split(US);
    if (fields.length < 7) continue;

    const [sha, shortSha, author, email, date, subject, body] = fields;
    out.push({
      sha: sha!.trim(),
      shortSha: shortSha!.trim(),
      author: author!.trim(),
      authorEmail: email!.trim(),
      date: date!.trim(),
      subject: subject!.trim(),
      body: (body ?? "").trim(),
      files: parseNumstat(numstat),
      references: extractReferences(`${subject}\n${body ?? ""}`),
    });
  }
  return out;
}

function parseNumstat(text: string) {
  const files = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const parts = line.split("\t");
    if (parts.length < 3) continue;
    const [ins, del, p] = parts;
    files.push({
      path: p!.trim(),
      insertions: ins === "-" ? 0 : parseInt(ins!, 10) || 0,
      deletions: del === "-" ? 0 : parseInt(del!, 10) || 0,
    });
  }
  return files;
}

type RefKind = "github_pr" | "github_issue" | "jira" | "linear" | "url";

// Pulls out things commit messages typically reference. Conservative on purpose
// — false positives waste tokens and confuse the synthesis.
export function extractReferences(text: string): Array<{ kind: RefKind; value: string }> {
  const refs: Array<{ kind: RefKind; value: string }> = [];
  const seen = new Set<string>();
  const add = (kind: RefKind, value: string) => {
    const key = `${kind}:${value}`;
    if (seen.has(key)) return;
    seen.add(key);
    refs.push({ kind, value });
  };

  // GitHub PR/issue URLs
  for (const m of text.matchAll(/https?:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/(\d+)/gi)) {
    add("github_pr", m[1]!);
  }
  for (const m of text.matchAll(/https?:\/\/github\.com\/[\w.-]+\/[\w.-]+\/issues\/(\d+)/gi)) {
    add("github_issue", m[1]!);
  }
  // bare "#1234" — could be PR or issue, github resolves either
  for (const m of text.matchAll(/(?:^|[\s(\[])#(\d{1,6})(?=\b)/g)) {
    add("github_pr", m[1]!);
  }
  // JIRA-style PROJ-1234
  for (const m of text.matchAll(/\b([A-Z][A-Z0-9]{1,9}-\d{1,6})\b/g)) {
    add("jira", m[1]!);
  }
  // linear URLs
  for (const m of text.matchAll(/https?:\/\/linear\.app\/[\w.-]+\/issue\/([\w-]+)/gi)) {
    add("linear", m[1]!);
  }
  // misc URLs, capped so we don't blow up the prompt
  let n = 0;
  for (const m of text.matchAll(/https?:\/\/[^\s)\]]+/g)) {
    if (n++ > 5) break;
    if (m[0].includes("github.com") || m[0].includes("linear.app")) continue;
    add("url", m[0]);
  }

  return refs;
}
