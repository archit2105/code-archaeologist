// API key resolution. Prefer SecretStorage > env var > settings > prompt.
// Never stash the key in settings.json — that file gets committed too often.

import * as vscode from "vscode";

const KEY = "codeArchaeologist.anthropicApiKey";

export async function getOrPromptApiKey(ctx: vscode.ExtensionContext): Promise<string | undefined> {
  const stored = await ctx.secrets.get(KEY);
  if (stored?.startsWith("sk-")) return stored;

  const env = process.env.ANTHROPIC_API_KEY;
  if (env?.startsWith("sk-")) return env;

  // settings.json — discouraged, but some users put it there anyway. Offer to migrate.
  const fromSettings = vscode.workspace
    .getConfiguration("codeArchaeologist")
    .get<string>("anthropicApiKey", "");
  if (fromSettings?.startsWith("sk-")) {
    const choice = await vscode.window.showWarningMessage(
      "Your Anthropic key is in settings.json (plaintext). Move it to encrypted storage?",
      "Move it",
      "Keep as-is"
    );
    if (choice === "Move it") {
      await ctx.secrets.store(KEY, fromSettings);
      await vscode.workspace
        .getConfiguration("codeArchaeologist")
        .update("anthropicApiKey", "", vscode.ConfigurationTarget.Global);
    }
    return fromSettings;
  }

  const entered = await vscode.window.showInputBox({
    title: "Anthropic API key",
    prompt: "Get one at https://console.anthropic.com/. Stored encrypted in VSCode.",
    placeHolder: "sk-ant-...",
    password: true,
    ignoreFocusOut: true,
    validateInput: (v) => {
      if (!v) return "Required.";
      if (!v.startsWith("sk-")) return "Doesn't look right.";
      return undefined;
    },
  });
  if (!entered) return undefined;

  await ctx.secrets.store(KEY, entered);
  vscode.window.showInformationMessage("API key saved.");
  return entered;
}

export async function clearApiKey(ctx: vscode.ExtensionContext): Promise<void> {
  await ctx.secrets.delete(KEY);
}
