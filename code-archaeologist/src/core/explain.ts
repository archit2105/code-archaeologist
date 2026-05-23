// Top-level "explain this code" — used by both the VSCode extension and CLI.
// No vscode imports here so the CLI doesn't pull in the extension API.

import { Archaeologist, type ArchaeologistConfig } from "./archaeologist.js";
import { AnthropicClient } from "../llm/client.js";
import { synthesize } from "../llm/synthesize.js";
import type { ArchaeologyResult, ExplanationQuery } from "../types/index.js";

export type ProgressStage =
  | { name: "gathering"; detail?: string }
  | { name: "synthesizing"; detail?: string }
  | { name: "done" };

export interface ExplainOptions {
  query: ExplanationQuery;
  apiKey: string;
  model: string;
  archaeologistConfig: ArchaeologistConfig;
  onProgress?: (s: ProgressStage) => void;
}

export async function explain(opts: ExplainOptions): Promise<ArchaeologyResult> {
  const t0 = Date.now();

  opts.onProgress?.({ name: "gathering" });
  const context = await new Archaeologist(opts.archaeologistConfig).gather(opts.query);

  opts.onProgress?.({
    name: "synthesizing",
    detail: `${context.commits.length} commits, ${context.pullRequests.length} PRs`,
  });

  const client = new AnthropicClient({ apiKey: opts.apiKey, model: opts.model });
  const { explanation, usage } = await synthesize({ client, context });

  opts.onProgress?.({ name: "done" });

  return { explanation, context, elapsedMs: Date.now() - t0, usage };
}
