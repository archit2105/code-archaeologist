#!/usr/bin/env node
// CLI. Same core as the extension.
// usage: code-archaeologist <file>:<line>[-<endLine>]

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { explain } from "../core/explain.js";
import { renderMarkdown } from "../core/renderer.js";
import { findRepoRoot, isGitAvailable } from "../git/runner.js";

async function main() {
  const arg = process.argv[2];
  if (!arg || arg === "--help" || arg === "-h") {
    printHelp();
    process.exit(arg ? 0 : 1);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY env var required.");
    console.error("https://console.anthropic.com/");
    process.exit(1);
  }

  if (!(await isGitAvailable())) {
    console.error("`git` not on PATH.");
    process.exit(1);
  }

  const m = arg.match(/^(.+?):(\d+)(?:-(\d+))?$/);
  if (!m) {
    console.error("usage: code-archaeologist <file>:<line>[-<endLine>]");
    process.exit(1);
  }
  const [, file, startStr, endStr] = m;
  const startLine = parseInt(startStr!, 10);
  const endLine = endStr ? parseInt(endStr, 10) : startLine;

  const absPath = path.resolve(file!);
  try {
    await fs.access(absPath);
  } catch {
    console.error(`File not found: ${absPath}`);
    process.exit(1);
  }

  const repoRoot = await findRepoRoot(absPath).catch(() => null);
  if (!repoRoot) {
    console.error(`Not inside a git repo: ${absPath}`);
    process.exit(1);
  }
  const relativePath = path.relative(repoRoot, absPath).replace(/\\/g, "/");

  const content = await fs.readFile(absPath, "utf-8");
  const lines = content.split("\n");
  if (startLine < 1 || endLine > lines.length) {
    console.error(`Line range out of bounds (file has ${lines.length} lines)`);
    process.exit(1);
  }

  const codeSnippet = lines.slice(startLine - 1, endLine).join("\n");
  const ctxStart = Math.max(1, startLine - 20);
  const ctxEnd = Math.min(lines.length, endLine + 20);
  const surroundingContext = lines.slice(ctxStart - 1, ctxEnd).join("\n");

  console.log(
    `🏺 Excavating ${relativePath}:${startLine}${endLine !== startLine ? `-${endLine}` : ""}...\n`
  );

  const result = await explain({
    query: {
      filePath: absPath,
      repoRoot,
      relativePath,
      startLine,
      endLine,
      codeSnippet,
      surroundingContext,
      language: detectLang(absPath),
    },
    apiKey,
    model: process.env.CODE_ARCHAEOLOGIST_MODEL ?? "claude-opus-4-7",
    archaeologistConfig: {
      maxCommitsToWalk: parseInt(process.env.MAX_COMMITS ?? "20", 10),
      includeFileHistory: true,
      followFileRenames: true,
      fetchGitHubPRs: process.env.NO_GITHUB !== "1",
      githubToken: process.env.GITHUB_TOKEN || undefined,
    },
    onProgress: (s) => {
      if (s.name === "gathering") process.stderr.write("  → walking git history\n");
      else if (s.name === "synthesizing")
        process.stderr.write(`  → synthesizing (${s.detail ?? ""})\n`);
    },
  });

  console.log(renderMarkdown(result));
  console.log(
    `\n─ ${result.elapsedMs}ms · ${result.usage.inputTokens} in / ${result.usage.outputTokens} out tokens`
  );
}

const LANG_BY_EXT: Record<string, string> = {
  ts: "typescript", tsx: "typescriptreact",
  js: "javascript", jsx: "javascriptreact",
  py: "python", rb: "ruby", go: "go", rs: "rust",
  java: "java", kt: "kotlin", swift: "swift",
  c: "c", h: "c", cpp: "cpp", cc: "cpp", hpp: "cpp",
  cs: "csharp", php: "php", sh: "shell",
  yaml: "yaml", yml: "yaml",
};

function detectLang(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase().slice(1);
  return LANG_BY_EXT[ext] ?? ext ?? "plaintext";
}

function printHelp() {
  console.log(`code-archaeologist — explain why a line of code exists

usage:
  code-archaeologist <file>:<line>
  code-archaeologist <file>:<start>-<end>

examples:
  code-archaeologist src/auth.ts:42
  code-archaeologist src/parser.go:120-145

env:
  ANTHROPIC_API_KEY         required
  CODE_ARCHAEOLOGIST_MODEL  default: claude-opus-4-7
  MAX_COMMITS               default: 20
  GITHUB_TOKEN              optional (higher rate limit)
  NO_GITHUB=1               disable PR fetching`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
