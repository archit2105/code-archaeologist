// `git blame --porcelain` parser.
//
// porcelain format per commit looks like:
//   <sha> <orig> <final> [<group>]
//   author Name
//   author-mail <email>
//   author-time <unix>
//   ...
//   <TAB>actual code
//
// First time a sha appears, metadata follows. After that just the header
// and the code line.

import { runGit } from "./runner.js";
import type { BlameEntry } from "../types/index.js";

export interface BlameOptions {
  repoRoot: string;
  filePath: string;
  startLine: number;
  endLine: number;
  followCopies?: boolean;
}

export async function blameLines(opts: BlameOptions): Promise<BlameEntry[]> {
  const args = ["blame", "--porcelain", "-L", `${opts.startLine},${opts.endLine}`];
  if (opts.followCopies) args.push("-C", "-M");
  args.push("--", opts.filePath);

  const out = await runGit(args, { cwd: opts.repoRoot });
  return parse(out);
}

function parse(text: string): BlameEntry[] {
  const lines = text.split("\n");
  const seen = new Map<string, Partial<BlameEntry>>();
  const out: BlameEntry[] = [];

  let i = 0;
  while (i < lines.length) {
    const header = lines[i];
    if (!header) { i++; continue; }

    const m = header.match(/^([0-9a-f]{40})\s+(\d+)\s+(\d+)(?:\s+\d+)?$/);
    if (!m) { i++; continue; }

    const sha = m[1]!;
    const origLine = parseInt(m[2]!, 10);

    let meta = seen.get(sha);
    if (!meta) {
      meta = { commitSha: sha };
      seen.set(sha, meta);
      i++;
      // consume metadata lines until we hit the tab-prefixed content
      while (i < lines.length && !lines[i]!.startsWith("\t")) {
        const line = lines[i]!;
        const sp = line.indexOf(" ");
        const key = sp === -1 ? line : line.slice(0, sp);
        const val = sp === -1 ? "" : line.slice(sp + 1);
        if (key === "author") meta.author = val;
        else if (key === "author-mail") meta.authorEmail = val.replace(/[<>]/g, "");
        else if (key === "author-time") meta.authorDate = new Date(parseInt(val, 10) * 1000).toISOString();
        else if (key === "summary") meta.summary = val;
        i++;
      }
      if (i < lines.length && lines[i]!.startsWith("\t")) i++;
    } else {
      i++;
      if (i < lines.length && lines[i]!.startsWith("\t")) i++;
    }

    out.push({
      commitSha: sha,
      author: meta.author ?? "Unknown",
      authorEmail: meta.authorEmail ?? "",
      authorDate: meta.authorDate ?? new Date(0).toISOString(),
      summary: meta.summary ?? "",
      body: "", // history walker fills this in
      originalLineNumber: origLine,
    });
  }

  return out;
}
