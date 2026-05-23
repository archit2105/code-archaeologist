// Webview that shows the result. Uses a webview instead of a markdown
// preview because we want VSCode-themed styling and full control over
// the loading/error states.

import * as vscode from "vscode";
import type { ExplanationQuery } from "../types/index.js";

export class ResultPanel {
  private query: ExplanationQuery;

  private constructor(private panel: vscode.WebviewPanel, query: ExplanationQuery) {
    this.query = query;
    this.panel.webview.html = loadingHtml(query);
  }

  static create(query: ExplanationQuery): ResultPanel {
    const fname = query.relativePath.split("/").pop();
    const panel = vscode.window.createWebviewPanel(
      "codeArchaeologist.result",
      `🏺 ${fname}:${query.startLine}`,
      vscode.ViewColumn.Beside,
      { enableScripts: false, retainContextWhenHidden: true }
    );
    return new ResultPanel(panel, query);
  }

  setStatus(text: string) {
    // no scripting in the webview, so just re-render with new status
    this.panel.webview.html = loadingHtml(this.query, text);
  }

  setResult(markdown: string) {
    this.panel.webview.html = resultHtml(markdown);
  }

  setError(message: string) {
    this.panel.webview.html = errorHtml(message);
  }
}

// ---- HTML rendering ----

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Lightweight markdown -> HTML. Our renderer's output is predictable so we
// don't need a full CommonMark parser. If this ever needs to handle arbitrary
// markdown, swap in `marked`.
function mdToHtml(md: string): string {
  let h = md;

  // fenced code blocks
  h = h.replace(/```(\w*)\n([\s\S]*?)```/g,
    (_, lang, code) => `<pre><code class="language-${esc(lang)}">${esc(code)}</code></pre>`);

  // inline code
  h = h.replace(/`([^`\n]+)`/g, (_, code) => `<code>${esc(code)}</code>`);

  // headers
  h = h.replace(/^#### (.+)$/gm, "<h4>$1</h4>");
  h = h.replace(/^### (.+)$/gm, "<h3>$1</h3>");

  // links
  h = h.replace(/\[([^\]]+)\]\(([^)]+)\)/g,
    (_, t, u) => `<a href="${esc(u)}" target="_blank" rel="noopener">${t}</a>`);

  // bold + italic
  h = h.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  h = h.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");

  // lists
  h = h.replace(/^(\s*)- (.+)$/gm, "$1<li>$2</li>");
  h = h.replace(/(<li>.*<\/li>\n?)+/g, "<ul>$&</ul>");

  // hr
  h = h.replace(/^---$/gm, "<hr>");

  // paragraphs
  h = h.split("\n\n").map((p) => {
    const t = p.trim();
    if (!t || /^<(h\d|ul|pre|hr|details|summary|sub)/.test(t)) return p;
    return `<p>${p}</p>`;
  }).join("\n\n");

  return h;
}

const styles = `
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
         padding: 20px; max-width: 900px; line-height: 1.55; color: var(--vscode-foreground); }
  h3 { margin: 0 0 8px; font-size: 1.25em; }
  h4 { margin: 20px 0 6px; font-size: 1em; color: var(--vscode-textLink-activeForeground); }
  sub { color: var(--vscode-descriptionForeground); font-size: 0.85em; }
  pre { background: var(--vscode-textCodeBlock-background); padding: 12px; border-radius: 4px;
        overflow-x: auto; font-size: 0.9em; }
  code { background: var(--vscode-textCodeBlock-background); padding: 1px 5px; border-radius: 3px;
         font-size: 0.92em; font-family: var(--vscode-editor-font-family, monospace); }
  pre code { background: transparent; padding: 0; }
  a { color: var(--vscode-textLink-foreground); text-decoration: none; }
  a:hover { text-decoration: underline; }
  hr { border: none; border-top: 1px solid var(--vscode-widget-border); margin: 24px 0; }
  ul { padding-left: 22px; }
  li { margin: 4px 0; }
  details { margin: 16px 0; }
  summary { cursor: pointer; color: var(--vscode-descriptionForeground); font-size: 0.9em; }
  .spinner { display: inline-block; width: 12px; height: 12px;
             border: 2px solid var(--vscode-descriptionForeground); border-right-color: transparent;
             border-radius: 50%; animation: spin 0.8s linear infinite;
             vertical-align: middle; margin-right: 8px; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .error { color: var(--vscode-errorForeground); background: var(--vscode-inputValidation-errorBackground);
           padding: 12px; border-radius: 4px; border-left: 3px solid var(--vscode-errorForeground); }
`;

function loadingHtml(q: ExplanationQuery, status = "Starting…"): string {
  return `<!DOCTYPE html><html><head><style>${styles}</style></head><body>
    <h3>🏺 Excavating <code>${esc(q.relativePath)}:${q.startLine}</code></h3>
    <p><span class="spinner"></span> ${esc(status)}</p>
  </body></html>`;
}

function resultHtml(md: string): string {
  return `<!DOCTYPE html><html><head><style>${styles}</style></head><body>${mdToHtml(md)}</body></html>`;
}

function errorHtml(msg: string): string {
  return `<!DOCTYPE html><html><head><style>${styles}</style></head><body>
    <h3>Archaeology failed</h3>
    <div class="error">${esc(msg)}</div>
  </body></html>`;
}
