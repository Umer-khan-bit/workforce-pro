import Anthropic from "@anthropic-ai/sdk";

export type AiErrorCode =
  | "NO_API_KEY"
  | "BAD_API_KEY"
  | "NO_CREDIT"
  | "RATE_LIMITED"
  | "OVERLOADED"
  | "NETWORK"
  | "BAD_MODEL"
  | "REFUSED"
  | "TRUNCATED"
  | "BAD_RESPONSE"
  | "BAD_REQUEST"
  | "INVALID_INPUT"
  | "UNKNOWN";

const HTTP_STATUS: Record<AiErrorCode, number> = {
  NO_API_KEY: 503,
  BAD_API_KEY: 502,
  NO_CREDIT: 402,
  RATE_LIMITED: 429,
  OVERLOADED: 503,
  NETWORK: 502,
  BAD_MODEL: 502,
  REFUSED: 422,
  TRUNCATED: 502,
  BAD_RESPONSE: 502,
  BAD_REQUEST: 502,
  INVALID_INPUT: 400,
  UNKNOWN: 502,
};

/** An AI problem with a message that is safe and clear enough to show the admin as it is. */
export class AiError extends Error {
  readonly code: AiErrorCode;
  readonly httpStatus: number;

  constructor(code: AiErrorCode, message: string) {
    super(message);
    this.name = "AiError";
    this.code = code;
    this.httpStatus = HTTP_STATUS[code];
  }
}

export const noApiKeyError = () =>
  new AiError(
    "NO_API_KEY",
    "The Anthropic API key is not set. Add ANTHROPIC_API_KEY to the .env file and restart the app."
  );

const CREDIT_PATTERN = /credit balance|billing|payment|insufficient (funds|credit)/i;

/**
 * Turns whatever the SDK threw into an AiError with plain wording. Never includes the request
 * or the key, only a fixed message per problem.
 */
export function toAiError(err: unknown): AiError {
  if (err instanceof AiError) return err;

  if (err instanceof Anthropic.AuthenticationError) {
    return new AiError("BAD_API_KEY", "Anthropic rejected the API key. Check ANTHROPIC_API_KEY in the .env file.");
  }
  if (err instanceof Anthropic.PermissionDeniedError) {
    return new AiError(
      "BAD_API_KEY",
      "The API key is not allowed to use this model or feature. Check the key's permissions and the model name in Settings."
    );
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new AiError("RATE_LIMITED", "Anthropic is rate-limiting requests. Wait a minute and try again.");
  }
  if (err instanceof Anthropic.NotFoundError) {
    return new AiError(
      "BAD_MODEL",
      "Anthropic could not find that model. Check the model names under Settings > AI generation."
    );
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new AiError("NETWORK", "Could not reach Anthropic. Check the internet connection and try again.");
  }
  if (err instanceof Anthropic.APIError) {
    const message = typeof err.message === "string" ? err.message : "";
    if (err.status === 402 || CREDIT_PATTERN.test(message)) {
      return new AiError(
        "NO_CREDIT",
        "Your Anthropic account has no credit left. Add credit in the Anthropic console, then try again."
      );
    }
    if (err.status === 529 || err.status === 503 || err.status === 500) {
      return new AiError("OVERLOADED", "Anthropic is busy or having problems right now. Try again in a minute.");
    }
    if (err.status === 400) {
      return new AiError("BAD_REQUEST", "Anthropic could not process this request. Check the model and prompts in Settings.");
    }
  }
  return new AiError("UNKNOWN", "Something went wrong talking to Anthropic. Try again in a moment.");
}
