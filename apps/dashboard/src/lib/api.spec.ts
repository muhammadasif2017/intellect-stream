import { ApiError, apiFetch } from './api';

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('apiFetch', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns parsed JSON on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(200, { id: 'p1' })),
    );
    await expect(apiFetch<{ id: string }>('/posts/p1')).resolves.toEqual({
      id: 'p1',
    });
  });

  it('always sends credentials (session cookie auth)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    vi.stubGlobal('fetch', fetchMock);
    await apiFetch('/dev/status');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/dev/status'),
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('throws ApiError with the server message on failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(jsonResponse(429, { message: 'rate limited' })),
    );
    const error = await apiFetch('/posts').catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(429);
    expect(error.message).toBe('rate limited');
  });

  it('joins array validation messages (Nest ValidationPipe shape)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(400, {
          message: ['title should not be empty', 'body too short'],
        }),
      ),
    );
    const error = await apiFetch('/posts').catch((e) => e);
    expect(error.message).toBe('title should not be empty, body too short');
  });

  it('falls back to the status line for non-JSON error bodies', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('<html>Bad Gateway</html>', {
          status: 502,
          statusText: 'Bad Gateway',
        }),
      ),
    );
    const error = await apiFetch('/dev/status').catch((e) => e);
    expect(error.status).toBe(502);
    expect(error.message).toBe('502 Bad Gateway');
  });
});
