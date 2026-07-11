const baseUrl: string =
  import.meta.env.VITE_GATEWAY_URL ?? 'http://localhost:3000';

/* One error shape for every failed request — ErrorState renders
 * `status` + `message` without caring which endpoint failed. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    /* Session cookie auth (gateway) — every request carries credentials. */
    credentials: 'include',
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    let body: unknown;
    let message = `${response.status} ${response.statusText}`;
    try {
      body = await response.json();
      const candidate = (body as { message?: string | string[] }).message;
      if (Array.isArray(candidate)) message = candidate.join(', ');
      else if (typeof candidate === 'string') message = candidate;
    } catch {
      /* non-JSON error body — keep the status line */
    }
    throw new ApiError(response.status, message, body);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export { baseUrl as gatewayBaseUrl };
