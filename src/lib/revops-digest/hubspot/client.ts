const HUBSPOT_API_BASE = "https://api.hubapi.com";

// A full scan can make 200+ sequential HubSpot calls for a large portal (paginated search,
// batch-read deals, batch-read companies), which is enough to trip HubSpot's per-second rate
// limit even without any concurrency on our side — hit this in production against an 8,800-deal
// portal. Retrying with backoff here (rather than in every caller) covers every HubSpot call in
// one place.
const MAX_RATE_LIMIT_RETRIES = 5;
const DEFAULT_RETRY_DELAY_MS = 1000;

export class HubSpotAuthError extends Error {
  constructor(status: number, message: string) {
    super(`HubSpot auth failed (${status}): ${message}`);
    this.name = "HubSpotAuthError";
  }
}

export class HubSpotApiError extends Error {
  constructor(status: number, message: string) {
    super(`HubSpot API error (${status}): ${message}`);
    this.name = "HubSpotApiError";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Thin fetch() wrapper for HubSpot API v3. Never logs the token. Throws HubSpotAuthError for
 * 401/403 so callers can distinguish "bad token" from other failures. Retries on 429 (rate
 * limit) with backoff before giving up. */
export async function hubspotRequest<T>(
  token: string,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt++) {
    const response = await fetch(`${HUBSPOT_API_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
    });

    if (response.status === 429 && attempt < MAX_RATE_LIMIT_RETRIES) {
      const retryAfterHeader = response.headers.get("Retry-After");
      const waitMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : DEFAULT_RETRY_DELAY_MS * (attempt + 1);
      await sleep(waitMs);
      continue;
    }

    if (!response.ok) {
      let message = response.statusText;
      try {
        const body = (await response.json()) as { message?: string };
        if (body.message) message = body.message;
      } catch {
        // response body wasn't JSON — fall back to statusText
      }

      if (response.status === 401 || response.status === 403) {
        throw new HubSpotAuthError(response.status, message);
      }
      throw new HubSpotApiError(response.status, message);
    }

    return (await response.json()) as T;
  }

  // Unreachable in practice — the loop above always either retries, throws, or returns. TS
  // needs an explicit exhaustive return path here since it can't prove the loop always exits.
  throw new HubSpotApiError(429, "Exceeded max retries after repeated rate limiting");
}
