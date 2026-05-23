// Shells out to `git`. Decided against nodegit/isomorphic-git after spending
// half a day fighting libgit2 binaries on Windows. git CLI is everywhere,
// --porcelain output is stable, life is short.

import { exec } from "node:child_process";
import { promisify } from "node:util";
import * as path from "node:path";
import * as fs from "node:fs/promises";

const sh = promisify(exec);

export class GitError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "GitError";
  }
}

export interface GitRunOptions {
  cwd: string;
  timeout?: number;
  maxBuffer?: number;
}

export async function runGit(args: string[], opts: GitRunOptions): Promise<string> {
  const cmd = `git ${args.map(quote).join(" ")}`;
  try {
    const { stdout } = await sh(cmd, {
      cwd: opts.cwd,
      timeout: opts.timeout ?? 15_000,
      maxBuffer: opts.maxBuffer ?? 50 * 1024 * 1024,
      windowsHide: true,
    });
    return stdout;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new GitError(`git ${args[0]} failed: ${msg}`, err);
  }
}

function quote(arg: string): string {
  if (/^[A-Za-z0-9_\-./=@:]+$/.test(arg)) return arg;
  return `"${arg.replace(/(["\\$`])/g, "\\$1")}"`;
}

export async function findRepoRoot(startPath: string): Promise<string> {
  const stat = await fs.stat(startPath);
  let dir = stat.isDirectory() ? startPath : path.dirname(startPath);

  // walk up looking for .git
  while (true) {
    try {
      await fs.stat(path.join(dir, ".git"));
      return dir;
    } catch {
      // not here
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new GitError(`Not inside a git repository: ${startPath}`);
    }
    dir = parent;
  }
}

export async function isGitAvailable(): Promise<boolean> {
  try {
    await sh("git --version", { timeout: 3000, windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

// Parses `origin` to figure out where the repo lives. Returns provider="unknown"
// for self-hosted forges; we'll fall back to plain SHAs in the UI.
export async function detectRemote(repoRoot: string): Promise<{
  provider: "github" | "gitlab" | "bitbucket" | "unknown";
  slug?: string;
}> {
  let url: string;
  try {
    url = (await runGit(["remote", "get-url", "origin"], { cwd: repoRoot })).trim();
  } catch {
    return { provider: "unknown" };
  }

  const m = url.match(
    /(?:github\.com|gitlab\.com|bitbucket\.org)[:/]([\w.-]+)\/([\w.-]+?)(?:\.git)?$/
  );
  if (!m) return { provider: "unknown" };

  const provider = url.includes("github.com")
    ? "github"
    : url.includes("gitlab.com")
    ? "gitlab"
    : "bitbucket";
  return { provider, slug: `${m[1]}/${m[2]}` };
}
