/**
 * Authentication Middleware
 * Reads user info from SWA x-ms-client-principal header
 * Validates user exists in database
 * Checks permissions for protected endpoints
 */

const { Errors } = require('./error-handler');

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
    console.error('Failed to parse user header:', err);
    return null;
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
  
  if (!principal || !principal.userPrincipalName) {
    return next(Errors.Unauthorized());
  }

  // In production, verify user exists in [security].[User] table
  // For now, trust the SWA header
  req.user = {
    email: principal.userPrincipalName,
    name: principal.userDetails || principal.userPrincipalName,
    swaRoles: principal.userRoles || [],
    roles: [], // Loaded from database in next step
    permissions: [], // Loaded from database in next step
  };

  // TODO: Load user.roles and user.permissions from database
  // SELECT r.RoleName, p.PermissionName FROM [security].[User] u
  // JOIN [security].[UserRole] ur ON u.UserId = ur.UserId
  // JOIN [security].[Role] r ON ur.RoleId = r.RoleId
  // JOIN [security].[RolePermission] rp ON r.RoleId = rp.RoleId
  // JOIN [security].[Permission] p ON rp.PermissionId = p.PermissionId
  // WHERE u.Email = @email

  next();
};

/**
 * Require specific permission
 * Use: router.get('/path', requirePermission('invoice.create'), handler)
 */
const requirePermission = (requiredPermission) => (req, res, next) => {
  if (!req.user) {
    return next(Errors.Unauthorized());
  }

  if (!req.user.permissions.includes(requiredPermission)) {
    return next(Errors.Forbidden(`perform this action (requires: ${requiredPermission})`));
  }

  next();
};

module.exports = {
  middleware,
  requirePermission,
  parseUserHeader,
};
