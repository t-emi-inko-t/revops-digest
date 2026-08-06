const HUBSPOT_API_BASE = "https://api.hubapi.com";

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

/** Thin fetch() wrapper for HubSpot API v3. Never logs the token. Throws HubSpotAuthError for
 * 401/403 so callers can distinguish "bad token" from other failures. */
export async function hubspotRequest<T>(
  token: string,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${HUBSPOT_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });

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
