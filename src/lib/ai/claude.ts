import Anthropic from "@anthropic-ai/sdk";
import { AiError, noApiKeyError, toAiError } from "./errors";
import type { Usage } from "./cost";

/** The small part of the SDK we use, so tests can pass a fake. */
export type ClaudeClient = { messages: Pick<Anthropic["messages"], "create"> };

/** Creates the client from the key in the environment. Throws a clear AiError when it is missing. */
export function getClaudeClient(): ClaudeClient {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) throw noApiKeyError();
  // Two automatic retries for temporary failures; a long timeout because careful writing is slow.
  return new Anthropic({ apiKey, maxRetries: 2, timeout: 5 * 60 * 1000 });
}

export type JsonRequest = {
  model: string;
  system: string;
  user: string;
  schema: Record<string, unknown>;
  maxTokens: number;
  effort: "low" | "medium" | "high";
};

/**
 * Asks Claude for JSON that follows `schema` and returns the parsed value with token usage.
 * Every failure (no credit, bad key, refusal, cut-off or unparseable reply) becomes an AiError.
 */
export async function askClaudeJson(
  client: ClaudeClient,
  req: JsonRequest
): Promise<{ data: unknown; usage: Usage }> {
  let response;
  try {
    response = await client.messages.create({
      model: req.model,
      max_tokens: req.maxTokens,
      system: req.system,
      messages: [{ role: "user", content: req.user }],
      output_config: { effort: req.effort, format: { type: "json_schema", schema: req.schema } },
    });
  } catch (err) {
    throw toAiError(err);
  }

  const usage: Usage = {
    inputTokens:
      (response.usage.input_tokens ?? 0) +
      (response.usage.cache_creation_input_tokens ?? 0) +
      (response.usage.cache_read_input_tokens ?? 0),
    outputTokens: response.usage.output_tokens ?? 0,
  };

  if (response.stop_reason === "refusal") {
    throw new AiError("REFUSED", "Claude declined to produce this batch. Try different wording in the focus note.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new AiError(
      "TRUNCATED",
      "Claude's reply was cut off. Lower the batch size or raise the maximum reply length under Settings > AI generation."
    );
  }

  const text = response.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
  if (!text) throw new AiError("BAD_RESPONSE", "Claude returned no usable answer. Try again.");

  try {
    return { data: JSON.parse(text), usage };
  } catch {
    throw new AiError("BAD_RESPONSE", "Claude's reply was not valid data. Try again.");
  }
}
