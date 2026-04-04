/**
 * Typed error hierarchy for the Pacifica SDK.
 *
 * Callers can narrow on `instanceof` to distinguish rate limiting, signing
 * failures, and generic API errors without inspecting string messages.
 */

export class PacificaError extends Error {
  public readonly code?: string;
  public readonly status?: number;

  constructor(message: string, code?: string, status?: number) {
    super(message);
    this.name = 'PacificaError';
    this.code = code;
    this.status = status;
  }
}

export class PacificaRateLimitError extends PacificaError {
  public readonly retryAfterMs: number;

  constructor(retryAfterMs: number) {
    super(`Rate limited, retry after ${retryAfterMs}ms`, 'RATE_LIMITED', 429);
    this.name = 'PacificaRateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

export class PacificaSigningError extends PacificaError {
  constructor(message: string) {
    super(message, 'SIGNING_ERROR');
    this.name = 'PacificaSigningError';
  }
}
