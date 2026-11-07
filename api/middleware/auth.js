/**
 * Authentication Middleware
 * Reads user info from SWA x-ms-client-principal header
 * Loads user roles and permissions from database
 * Provides role-based access control
 */

import { Errors } from './error-handler.js';
import { getDatabase } from '../services/database.js';

/**
 * Parse x-ms-client-principal header (set by Azure Static Web Apps)
 * Format: base64 JSON with userPrincipalName, mail, roles, etc.
 */
const parseUserHeader = (headerValue) => {
  if (!headerValue) return null;
  
  try {
    const decoded = Buffer.from(headerValue, 'base64').toString('utf-8');
    return JSON.parse(decoded);
  } catch (err) {
    console.error('[AUTH] Failed to parse user header:', err);
    return null;
  }
};

/**
 * Load user roles and permissions from database
 * Returns { roles: [], permissions: [] }
 */
const loadUserRoles = async (email) => {
  try {
    const db = getDatabase();
    const result = await db.query(`
      SELECT DISTINCT
        r.RoleName,
        p.PermissionName
      FROM [security].[User] u
      LEFT JOIN [security].[UserRole] ur ON u.UserId = ur.UserId AND ur.IsDeleted = 0
      LEFT JOIN [security].[Role] r ON ur.RoleId = r.RoleId AND r.IsDeleted = 0
      LEFT JOIN [security].[RolePermission] rp ON r.RoleId = rp.RoleId AND rp.IsDeleted = 0
      LEFT JOIN [security].[Permission] p ON rp.PermissionId = p.PermissionId AND p.IsDeleted = 0
      WHERE u.Email = @email AND u.IsActive = 1 AND u.IsDeleted = 0
      ORDER BY r.RoleName, p.PermissionName
    `, { email });

    const roles = new Set();
    const permissions = new Set();

    result.forEach(row => {
      if (row.RoleName) roles.add(row.RoleName);
      if (row.RoleName && row.PermissionName) permissions.add(row.PermissionName.toLowerCase());
    });

    return {
      roles: Array.from(roles),
      permissions: Array.from(permissions),
    };
  } catch (err) {
    console.error('[AUTH] Failed to load user roles:', err);
    throw Errors.DatabaseError('Unable to load user roles and permissions');
  }
};

/**
 * Auth middleware - extract and validate user
 * Use: app.use(authMiddleware)
 * 
 * Sets req.user = { email, name, roles, permissions }
 */
const middleware = async (req, res, next) => {
  const principal = parseUserHeader(req.headers['x-ms-client-principal']);
  
  if (!principal || !(principal.userPrincipalName || principal.userDetails)) {
    // No auth header: let routes handle what's allowed
    // (e.g., /api/health and /api/docs don't need auth)
    req.user = null;
    return next();
  }

  const email = principal.userPrincipalName || principal.userDetails;
  let roles;
  let permissions;
  try {
    ({ roles, permissions } = await loadUserRoles(email));
  } catch (error) {
    return next(error);
  }

  req.user = {
    email,
    name: principal.userDetails || email,
    swaRoles: principal.userRoles || [],
    roles,
    permissions,
  };

  console.log(`[AUTH] User: ${email}, Roles: [${roles.join(', ')}], Permissions: ${permissions.length}`);
  next();
};

/**
 * Require authentication (user must be logged in)
 * Use: router.get('/path', requireAuth, handler)
 */
const requireAuth = (req, res, next) => {
  if (!req.user) {
    return next(Errors.Unauthorized('You must be logged in'));
  }
  next();
};

/**
 * Require specific permission
 * Use: router.get('/path', requirePermission('invoice.create'), handler)
 */
const requirePermission = (requiredPermission) => (req, res, next) => {
  if (!req.user) {
    return next(Errors.Unauthorized('You must be logged in'));
  }

  if (!req.user.permissions.includes(requiredPermission)) {
    return next(Errors.Forbidden(`You don't have permission to perform this action (requires: ${requiredPermission})`));
  }

  next();
};

/**
 * Require specific role
 * Use: router.get('/path', requireRole('Admin'), handler)
 */
const requireRole = (requiredRole) => (req, res, next) => {
  if (!req.user) {
    return next(Errors.Unauthorized('You must be logged in'));
  }

  if (!req.user.roles.includes(requiredRole)) {
    return next(Errors.Forbidden(`You don't have permission to perform this action (requires: ${requiredRole} role)`));
  }

  next();
};

export {
  middleware,
  requireAuth,
  requirePermission,
  requireRole,
  parseUserHeader,
  loadUserRoles,
};
