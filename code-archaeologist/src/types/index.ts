// Shared types. Two layers:
//   - what we gather from git (deterministic)
//   - what the LLM returns (validated by zod schema)

import { z } from "zod";

export interface ExplanationQuery {
  filePath: string;
  repoRoot: string;
  relativePath: string;
  startLine: number; // 1-indexed
  endLine: number;
  codeSnippet: string;
  surroundingContext: string; // ±20 lines around the snippet
  language: string;
}

export interface BlameEntry {
  commitSha: string;
  author: string;
  authorEmail: string;
  authorDate: string;
  summary: string;
  body: string;
  originalLineNumber: number;
}

export interface CommitInfo {
  sha: string;
  shortSha: string;
  author: string;
  authorEmail: string;
  date: string;
  subject: string;
  body: string;
  files: Array<{ path: string; insertions: number; deletions: number }>;
  references: Array<{
    kind: "github_pr" | "github_issue" | "jira" | "linear" | "url";
    value: string;
  }>;
}

export interface FileHistorySnippet {
  recentCommits: CommitInfo[];
  firstCommit?: CommitInfo;
  totalCommits: number;
  authorCount: number;
}

export interface GitHubPRSnippet {
  number: number;
  title: string;
  state: "open" | "closed" | "merged";
  author: string;
  url: string;
  body: string;
  mergedAt: string | null;
  comments: Array<{ author: string; body: string; createdAt: string }>;
}

export interface ArchaeologyContext {
  query: ExplanationQuery;
  blameChain: BlameEntry[];
  commits: CommitInfo[];
  fileHistory: FileHistorySnippet;
  pullRequests: GitHubPRSnippet[];
  repoProvider: "github" | "gitlab" | "bitbucket" | "unknown";
  repoSlug?: string;
  notes: string[];
}

// The LLM output. Kept small on purpose — fewer fields means fewer ways for
// the model to mess it up. Past learnings: a 13-field schema produced ~10%
// validation failures; the 6-field one below is closer to 0.
export const ExplanationSchema = z.object({
  headline: z.string().min(10),
  why: z.string().min(20),
  timeline: z.array(
    z.object({
      when: z.string(),
      what: z.string(),
      sha: z.string().optional(),
      prNumber: z.number().optional(),
    })
  ),
  notable: z.array(z.string()).default([]),
  unknown: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1),
});

export type Explanation = z.infer<typeof ExplanationSchema>;

export interface ArchaeologyResult {
  explanation: Explanation;
  context: ArchaeologyContext;
  elapsedMs: number;
  usage: { inputTokens: number; outputTokens: number };
}
