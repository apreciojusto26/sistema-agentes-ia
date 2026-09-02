import { describe, expect, it, vi } from 'vitest';
import { getAdminToken, type AdminTokenPorts } from '@/lib/shopify/admin-token';

function ports(overrides: Partial<AdminTokenPorts> = {}): AdminTokenPorts {
  return {
    getCached: async () => null,
    putCached: async () => {},
    fetchToken: async () => ({ access_token: 'minted', expires_in: 86399 }),
    ...overrides,
  };
}

describe('getAdminToken', () => {
  it('returns the cached token without minting a new one', async () => {
    const fetchToken = vi.fn();

    const token = await getAdminToken(ports({ getCached: async () => 'cached', fetchToken }));

    expect(token).toBe('cached');
    expect(fetchToken).not.toHaveBeenCalled();
  });

  it('mints a token on a cache miss and caches it below its expiry', async () => {
    const putCached = vi.fn(async () => {});

    const token = await getAdminToken(ports({ putCached }));

    expect(token).toBe('minted');
    // 86399 - 300 safety margin: a token must never be served moments before
    // Shopify stops honouring it.
    expect(putCached).toHaveBeenCalledWith('minted', 86099);
  });

  it('still returns a token too short-lived to be worth caching', async () => {
    const putCached = vi.fn(async () => {});

    const token = await getAdminToken(
      ports({ fetchToken: async () => ({ access_token: 'brief', expires_in: 60 }), putCached }),
    );

    expect(token).toBe('brief');
    expect(putCached).not.toHaveBeenCalled();
  });

  it('propagates a mint failure instead of returning an unusable token', async () => {
    await expect(
      getAdminToken(
        ports({
          fetchToken: async () => {
            throw new Error('HTTP 401 — app not installed on the store');
          },
        }),
      ),
    ).rejects.toThrow('app not installed');
  });
});
