// Minimal GitHub API client. Just the 3 endpoints we need.
// Octokit was tempting but it pulls in ~200KB for stuff we don't use.

import type { GitHubPRSnippet } from "../types/index.js";

export interface GitHubFetcherOptions {
  token?: string;
  userAgent?: string;
}

export class GitHubRateLimitError extends Error {
  constructor(public resetAt: Date) {
    super(`GitHub rate limit exceeded. Resets at ${resetAt.toISOString()}.`);
  }
}

export class GitHubFetcher {
  constructor(private opts: GitHubFetcherOptions = {}) {}

  private headers(): Record<string, string> {
    const h: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": this.opts.userAgent ?? "code-archaeologist-vscode",
    };
    if (this.opts.token) h.Authorization = `Bearer ${this.opts.token}`;
    return h;
  }

  private async get<T>(url: string): Promise<T> {
    const res = await fetch(url, { headers: this.headers() });

    if (res.status === 403 || res.status === 429) {
      const remaining = res.headers.get("x-ratelimit-remaining");
      const reset = res.headers.get("x-ratelimit-reset");
      if (remaining === "0" && reset) {
        throw new GitHubRateLimitError(new Date(parseInt(reset, 10) * 1000));
      }
    }
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`GitHub ${res.status}: ${body.slice(0, 200)}`);
    }
    return res.json() as Promise<T>;
  }

  async fetchPR(slug: string, num: number): Promise<GitHubPRSnippet | null> {
    try {
      const pr = await this.get<RawPR>(`https://api.github.com/repos/${slug}/pulls/${num}`);
      const comments = await this.fetchComments(slug, num).catch(() => []);
      return {
        number: pr.number,
        title: pr.title,
        state: pr.merged_at ? "merged" : (pr.state as "open" | "closed"),
        author: pr.user?.login ?? "unknown",
        url: pr.html_url,
        body: trunc(pr.body ?? "", 4000),
        mergedAt: pr.merged_at,
        comments,
      };
    } catch (err) {
      if (err instanceof Error && err.message.includes("404")) return null;
      throw err;
    }
  }

  private async fetchComments(slug: string, num: number, limit = 10) {
    // issue comments + review comments live at different endpoints.
    // grab both, merge, sort, slice.
    const [issue, review] = await Promise.all([
      this.get<RawComment[]>(
        `https://api.github.com/repos/${slug}/issues/${num}/comments?per_page=${limit}`
      ).catch(() => [] as RawComment[]),
      this.get<RawComment[]>(
        `https://api.github.com/repos/${slug}/pulls/${num}/comments?per_page=${limit}`
      ).catch(() => [] as RawComment[]),
    ]);

    return [...issue, ...review]
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .slice(0, limit)
      .map((c) => ({
        author: c.user?.login ?? "unknown",
        body: trunc(c.body ?? "", 800),
        createdAt: c.created_at,
      }));
  }

  async findPRForCommit(slug: string, sha: string): Promise<number | null> {
    try {
      const data = await this.get<RawPR[]>(
        `https://api.github.com/repos/${slug}/commits/${sha}/pulls`
      );
      return data[0]?.number ?? null;
    } catch {
      return null;
    }
  }
}

function trunc(s: string, n: number) {
  return s.length <= n ? s : s.slice(0, n) + "\n…[truncated]";
}

interface RawPR {
  number: number;
  title: string;
  state: string;
  html_url: string;
  body: string | null;
  merged_at: string | null;
  user: { login: string } | null;
}

interface RawComment {
  body: string | null;
  user: { login: string } | null;
  created_at: string;
}
