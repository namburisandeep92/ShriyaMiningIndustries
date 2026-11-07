import { afterEach, describe, expect, it, vi } from 'vitest';

import { apiClient } from '../../app/src/services/api.ts';

afterEach(() => vi.restoreAllMocks());

describe('UI authorization context', () => {
  it('loads database roles and permissions from the identity endpoint', async () => {
    const get = vi.spyOn(apiClient.instance, 'get').mockResolvedValue({ data: { authenticated: true, user: {
      roles: ['Viewer'], permissions: ['invoice.read'],
    } } });
    await apiClient.refreshAuthContext();
    expect(get).toHaveBeenCalledWith('/me');
    expect(apiClient.hasPermission('invoice.read')).toBe(true);
    expect(apiClient.hasPermission('invoice.create')).toBe(false);
  });

  it('clears stale access for an unauthenticated response', async () => {
    apiClient.setAuthContext({ permissions: ['invoice.create'] });
    vi.spyOn(apiClient.instance, 'get').mockResolvedValue({ data: { authenticated: false, user: null } });
    await apiClient.refreshAuthContext();
    expect(apiClient.getAuthContext()).toBeNull();
  });

  it('clears stale access and propagates lookup errors', async () => {
    apiClient.setAuthContext({ permissions: ['invoice.create'] });
    vi.spyOn(apiClient.instance, 'get').mockRejectedValue(new Error('Identity lookup failed'));
    await expect(apiClient.refreshAuthContext()).rejects.toThrow('Identity lookup failed');
    expect(apiClient.hasPermission('invoice.create')).toBe(false);
  });
});
