// VSCode extension entry. Registers the right-click commands and wires them
// to the core/explain function.

import * as vscode from "vscode";
import * as path from "node:path";
import { explain } from "../core/explain.js";
import { renderMarkdown } from "../core/renderer.js";
import { findRepoRoot, isGitAvailable } from "../git/runner.js";
import { getOrPromptApiKey } from "./apiKey.js";
import { ResultPanel } from "./resultPanel.js";
import type { ExplanationQuery } from "../types/index.js";

type Mode = "line" | "selection" | "function";

export function activate(ctx: vscode.ExtensionContext) {
  const reg = (cmd: string, handler: () => unknown) =>
    ctx.subscriptions.push(vscode.commands.registerCommand(cmd, handler));

  reg("codeArchaeologist.explainLine", () => run(ctx, "line"));
  reg("codeArchaeologist.explainSelection", () => run(ctx, "selection"));
  reg("codeArchaeologist.explainFunction", () => run(ctx, "function"));
}

export function deactivate() {
  // webview panels self-dispose
}

async function run(ctx: vscode.ExtensionContext, mode: Mode): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage("Open a file first.");
    return;
  }

  if (!(await isGitAvailable())) {
    vscode.window.showErrorMessage(
      "Code Archaeologist needs `git` on PATH. Install Git and reload."
    );
    return;
  }

  const filePath = editor.document.uri.fsPath;
  let repoRoot: string;
  try {
    repoRoot = await findRepoRoot(filePath);
  } catch {
    vscode.window.showErrorMessage("This file isn't inside a git repo.");
    return;
  }
  const relativePath = path.relative(repoRoot, filePath).replace(/\\/g, "/");

  const apiKey = await getOrPromptApiKey(ctx);
  if (!apiKey) return;

  const query = buildQuery(editor, mode, repoRoot, relativePath);
  if (!query) return;

  const config = vscode.workspace.getConfiguration("codeArchaeologist");
  const panel = ResultPanel.create(query);

  try {
    const result = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Code Archaeologist",
        cancellable: false,
      },
      (progress) =>
        explain({
          query,
          apiKey,
          model: config.get<string>("model", "claude-opus-4-7"),
          archaeologistConfig: {
            maxCommitsToWalk: config.get<number>("maxCommitsToWalk", 20),
            includeFileHistory: config.get<boolean>("includeFileHistory", true),
            followFileRenames: config.get<boolean>("followFileRenames", true),
            fetchGitHubPRs: config.get<boolean>("fetchGitHubPRs", true),
            githubToken: config.get<string>("githubToken", "") || undefined,
          },
          onProgress: (s) => {
            if (s.name === "gathering") {
              progress.report({ message: "Walking git history..." });
              panel.setStatus("Walking git history…");
            } else if (s.name === "synthesizing") {
              progress.report({ message: `Synthesizing (${s.detail ?? ""})…` });
              panel.setStatus(`Asking Claude (${s.detail ?? ""})…`);
            }
          },
        })
    );

    panel.setResult(renderMarkdown(result));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    panel.setError(msg);
    vscode.window.showErrorMessage(`Archaeology failed: ${msg}`);
  }
}

function buildQuery(
  editor: vscode.TextEditor,
  mode: Mode,
  repoRoot: string,
  relativePath: string
): ExplanationQuery | null {
  const doc = editor.document;
  const sel = editor.selection;

  let startLine: number;
  let endLine: number;

  if (mode === "selection") {
    if (sel.isEmpty) {
      vscode.window.showWarningMessage("Select some code first.");
      return null;
    }
    startLine = sel.start.line + 1;
    endLine = sel.end.line + 1;
    // selection ending at column 0 doesn't really include the last line
    if (sel.end.character === 0 && endLine > startLine) endLine--;
  } else {
    // line + function (function mode is a TODO — see README roadmap)
    startLine = sel.active.line + 1;
    endLine = startLine;
  }

  const MAX_LINES = 50;
  if (endLine - startLine + 1 > MAX_LINES) {
    vscode.window.showWarningMessage(
      `Selection too large (${endLine - startLine + 1} lines). Trimming to ${MAX_LINES}.`
    );
    endLine = startLine + MAX_LINES - 1;
  }

  if (startLine < 1 || endLine > doc.lineCount) {
    vscode.window.showWarningMessage("Invalid line range.");
    return null;
  }

  const range = new vscode.Range(startLine - 1, 0, endLine - 1, doc.lineAt(endLine - 1).text.length);
  const codeSnippet = doc.getText(range);

  // ±20 lines of context
  const ctxStart = Math.max(1, startLine - 20);
  const ctxEnd = Math.min(doc.lineCount, endLine + 20);
  const surroundingContext = doc.getText(
    new vscode.Range(ctxStart - 1, 0, ctxEnd - 1, doc.lineAt(ctxEnd - 1).text.length)
  );

  return {
    filePath: doc.uri.fsPath,
    repoRoot,
    relativePath,
    startLine,
    endLine,
    codeSnippet,
    surroundingContext,
    language: doc.languageId,
  };
}
