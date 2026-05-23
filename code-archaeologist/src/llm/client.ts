// Anthropic wrapper with self-correcting JSON output.
//
// Why: vanilla `messages.create` returns text. We want validated structured
// data, and we don't want to crash when the model occasionally returns null
// for an enum or forgets a field. So: parse, validate, retry with the actual
// error message fed back in. Usually recovers on attempt 2.

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

const MAX_ATTEMPTS = 3;

export interface ClientOptions {
  apiKey: string;
  model: string;
}

export interface CompleteJSONOptions<T> {
  system: string;
  user: string;
  schema: z.ZodType<T>;
  maxTokens?: number;
  model?: string;
}

export interface CompleteJSONResult<T> {
  data: T;
  usage: { inputTokens: number; outputTokens: number };
  attempts: number;
}

export class SchemaValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SchemaValidationError";
  }
}

export class AnthropicClient {
  private client: Anthropic;

  constructor(private opts: ClientOptions) {
    this.client = new Anthropic({ apiKey: opts.apiKey });
  }

  async completeJSON<T>(opts: CompleteJSONOptions<T>): Promise<CompleteJSONResult<T>> {
    const system = `${opts.system}

OUTPUT FORMAT:
- Return EXACTLY ONE JSON object, nothing else.
- No prose before or after. No markdown fences.
- Every required field MUST be present.
- Never use null for enum fields — pick a default from the allowed values.`;

    let lastErr: string | null = null;
    let lastRaw: string | null = null;
    let totalIn = 0;
    let totalOut = 0;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const user = lastErr
        ? `${opts.user}

---
Your previous response had validation errors:
${lastErr}

Your previous response:
${lastRaw}

Return the CORRECTED JSON. Fix every issue above.`
        : opts.user;

      const res = await this.client.messages.create({
        model: opts.model ?? this.opts.model,
        max_tokens: opts.maxTokens ?? 2048,
        system,
        messages: [{ role: "user", content: user }],
      });

      totalIn += res.usage.input_tokens;
      totalOut += res.usage.output_tokens;

      const text = res.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      const cleaned = stripFences(text);
      lastRaw = cleaned;

      let parsed: unknown;
      try {
        parsed = JSON.parse(cleaned);
      } catch (e) {
        lastErr = `Not valid JSON: ${(e as Error).message}`;
        continue;
      }

      const result = opts.schema.safeParse(parsed);
      if (result.success) {
        return {
          data: result.data,
          usage: { inputTokens: totalIn, outputTokens: totalOut },
          attempts: attempt + 1,
        };
      }

      lastErr = result.error.issues
        .map((i) => `  - path "${i.path.join(".")}": ${i.message}`)
        .join("\n");
    }

    throw new SchemaValidationError(
      `Schema validation failed after ${MAX_ATTEMPTS} attempts.\nLast errors:\n${lastErr}\n\nLast response:\n${lastRaw}`
    );
  }
}

function stripFences(s: string): string {
  return s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
}
