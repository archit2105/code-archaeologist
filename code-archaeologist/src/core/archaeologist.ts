// Gathers the deterministic evidence for an explanation:
//   blame -> commits -> file history -> linked PRs
// No LLM here. That's the whole point.

import { blameLines } from "../git/blame.js";
import { getCommit, getFileHistory, getFileAuthorCount } from "../git/history.js";
import { GitHubFetcher, GitHubRateLimitError } from "../git/github.js";
import { detectRemote } from "../git/runner.js";
import type {
  ArchaeologyContext,
  ExplanationQuery,
  CommitInfo,
  GitHubPRSnippet,
} from "../types/index.js";

export interface ArchaeologistConfig {
  maxCommitsToWalk: number;
  includeFileHistory: boolean;
  followFileRenames: boolean;
  fetchGitHubPRs: boolean;
  githubToken?: string;
}

export class Archaeologist {
  constructor(private cfg: ArchaeologistConfig) {}

  async gather(query: ExplanationQuery): Promise<ArchaeologyContext> {
    const notes: string[] = [];

    const { provider, slug } = await detectRemote(query.repoRoot);

    const blameChain = await blameLines({
      repoRoot: query.repoRoot,
      filePath: query.relativePath,
      startLine: query.startLine,
      endLine: query.endLine,
      followCopies: this.cfg.followFileRenames,
    });

    if (blameChain.length === 0) {
      notes.push("git blame returned nothing — line is probably uncommitted.");
    }

    // dedupe and cap
    const shas = Array.from(new Set(blameChain.map((b) => b.commitSha)))
      .slice(0, this.cfg.maxCommitsToWalk);

    const commits: CommitInfo[] = [];
    for (const sha of shas) {
      try {
        commits.push(await getCommit(query.repoRoot, sha));
      } catch (err) {
        notes.push(`Couldn't load commit ${sha.slice(0, 7)}: ${(err as Error).message}`);
      }
    }

    // blame --porcelain only gives us the subject; backfill bodies
    const bodyBySha = new Map(commits.map((c) => [c.sha, c.body]));
    for (const e of blameChain) {
      e.body = bodyBySha.get(e.commitSha) ?? "";
    }

    let fileHistory = {
      recentCommits: [] as CommitInfo[],
      firstCommit: undefined as CommitInfo | undefined,
      totalCommits: 0,
      authorCount: 0,
    };
    if (this.cfg.includeFileHistory) {
      try {
        const h = await getFileHistory({
          repoRoot: query.repoRoot,
          filePath: query.relativePath,
          limit: 10,
          followRenames: this.cfg.followFileRenames,
        });
        fileHistory = {
          recentCommits: h.commits,
          firstCommit: h.firstCommit,
          totalCommits: h.totalCount,
          authorCount: await getFileAuthorCount(
            query.repoRoot,
            query.relativePath,
            this.cfg.followFileRenames
          ),
        };
      } catch (err) {
        notes.push(`File history unavailable: ${(err as Error).message}`);
      }
    }

    const pullRequests: GitHubPRSnippet[] = [];
    if (this.cfg.fetchGitHubPRs && provider === "github" && slug) {
      await this.enrichWithPRs(commits, slug, pullRequests, notes);
    } else if (this.cfg.fetchGitHubPRs && provider !== "github") {
      notes.push(`PR fetching skipped — remote isn't github (${provider}).`);
    }

    return {
      query,
      blameChain,
      commits,
      fileHistory,
      pullRequests,
      repoProvider: provider,
      repoSlug: slug,
      notes,
    };
  }

  private async enrichWithPRs(
    commits: CommitInfo[],
    slug: string,
    out: GitHubPRSnippet[],
    notes: string[]
  ) {
    const gh = new GitHubFetcher({ token: this.cfg.githubToken });

    // candidates: explicit refs first, then lookups for commits without one
    const candidates = new Set<number>();
    for (const c of commits) {
      for (const r of c.references) {
        if (r.kind === "github_pr") {
          const n = parseInt(r.value, 10);
          if (!isNaN(n)) candidates.add(n);
        }
      }
    }

    // cap the lookups — they're rate-limit expensive
    const needsLookup = commits
      .filter((c) => !c.references.some((r) => r.kind === "github_pr"))
      .slice(0, 5);

    for (const c of needsLookup) {
      try {
        const pr = await gh.findPRForCommit(slug, c.sha);
        if (pr) candidates.add(pr);
      } catch (err) {
        if (err instanceof GitHubRateLimitError) {
          notes.push(
            this.cfg.githubToken
              ? "GitHub rate limit hit."
              : "GitHub rate limit hit. Set a token in settings for 5000/hr."
          );
          return; // stop trying
        }
      }
    }

    // 8 PRs is more than enough context; more just clutters the prompt
    for (const num of Array.from(candidates).slice(0, 8)) {
      try {
        const pr = await gh.fetchPR(slug, num);
        if (pr) out.push(pr);
      } catch (err) {
        if (err instanceof GitHubRateLimitError) {
          notes.push("GitHub rate limit hit while fetching PRs.");
          return;
        }
        // individual PR failure isn't worth aborting over
      }
    }
  }
}
