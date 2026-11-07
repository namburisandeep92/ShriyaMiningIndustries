import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadUserRoles, middleware } from '../../api/middleware/auth.js';
import { getDatabase } from '../../api/services/database.js';

afterEach(() => vi.restoreAllMocks());

describe('Database-backed authorization', () => {
  it('reads rows directly and normalizes seeded permission names', async () => {
    const query = vi.spyOn(getDatabase(), 'query').mockResolvedValue([
      { RoleName: 'User', PermissionName: 'Invoice.Read' },
      { RoleName: 'User', PermissionName: 'Invoice.Read' },
      { RoleName: 'User', PermissionName: 'File.Upload' },
      { RoleName: 'Viewer', PermissionName: null },
      { RoleName: null, PermissionName: 'Invoice.Delete' },
    ]);
    expect(await loadUserRoles('user@example.test')).toEqual({
      roles: ['User', 'Viewer'],
      permissions: ['invoice.read', 'file.upload'],
    });
    const [sql, parameters] = query.mock.calls[0];
    expect(parameters).toEqual({ email: 'user@example.test' });
    for (const filter of ['u.IsActive = 1', 'u.IsDeleted = 0', 'ur.IsDeleted = 0',
      'r.IsDeleted = 0', 'rp.IsDeleted = 0', 'p.IsDeleted = 0']) {
      expect(sql).toContain(filter);
    }
  });

  it('preserves empty permissions when the user has no active role assignments', async () => {
    vi.spyOn(getDatabase(), 'query').mockResolvedValue([]);
    expect(await loadUserRoles('user@example.test')).toEqual({ roles: [], permissions: [] });
  });

  it('forwards role lookup failure rather than disguising it as forbidden access', async () => {
    vi.spyOn(getDatabase(), 'query').mockRejectedValue(new Error('SQL unavailable'));
    const req = { headers: {
      'x-ms-client-principal': Buffer.from(JSON.stringify({
        userDetails: 'user@example.test', userRoles: ['authenticated', 'Admin'],
      })).toString('base64'),
    } };
    const next = vi.fn();
    await middleware(req, {}, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({
      statusCode: 500, errorCode: 'DB-ERROR-500',
    }));
    expect(req.user).toBeUndefined();
  });

  it('uses database roles, not SWA roles, for application access', async () => {
    vi.spyOn(getDatabase(), 'query').mockResolvedValue([
      { RoleName: 'Viewer', PermissionName: 'Invoice.Read' },
    ]);
    const req = { headers: {
      'x-ms-client-principal': Buffer.from(JSON.stringify({
        userDetails: 'user@example.test', userRoles: ['authenticated', 'Admin'],
      })).toString('base64'),
    } };
    const next = vi.fn();
    await middleware(req, {}, next);
    expect(req.user.roles).toEqual(['Viewer']);
    expect(req.user.permissions).toEqual(['invoice.read']);
    expect(next).toHaveBeenCalledWith();
  });
});
