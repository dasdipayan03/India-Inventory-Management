/**
 * =========================================================
 * FILE: middleware/auth.js
 * MODULE: Authentication & Access Control Middleware
 * PURPOSE:
 *  - Verify JWT token
 *  - Attach authenticated session to request
 *  - Resolve fresh staff permissions from the database
 *  - Provide reusable role and permission guards
 * =========================================================
 */
const jwt = require("jsonwebtoken");
const pool = require("../db");
const {
  DEFAULT_STAFF_PERMISSIONS,
  normalizePermissions,
} = require("../public/js/permission-contract");

if (!process.env.JWT_SECRET) {
  console.error("JWT_SECRET not found in environment variables.");
  process.exit(1);
}

const STAFF_SESSION_CACHE_TTL_MS = 15 * 1000;
const STAFF_SESSION_CACHE_MAX_ENTRIES = 200;
const staffSessionCache = new Map();

function getStaffSessionCacheKey(staffId) {
  const normalizedStaffId = Number(staffId);
  return Number.isInteger(normalizedStaffId) && normalizedStaffId > 0
    ? normalizedStaffId
    : 0;
}

function getCachedStaffSession(staffId) {
  const cacheKey = getStaffSessionCacheKey(staffId);
  if (!cacheKey) {
    return null;
  }

  const cachedEntry = staffSessionCache.get(cacheKey);
  if (!cachedEntry) {
    return null;
  }

  if (cachedEntry.expiresAt <= Date.now()) {
    staffSessionCache.delete(cacheKey);
    return null;
  }

  return cachedEntry.value;
}

function setCachedStaffSession(staffId, sessionData) {
  const cacheKey = getStaffSessionCacheKey(staffId);
  if (!cacheKey) {
    return sessionData;
  }

  while (staffSessionCache.size >= STAFF_SESSION_CACHE_MAX_ENTRIES) {
    const oldestKey = staffSessionCache.keys().next().value;
    if (oldestKey === undefined) {
      break;
    }
    staffSessionCache.delete(oldestKey);
  }

  staffSessionCache.set(cacheKey, {
    value: sessionData,
    expiresAt: Date.now() + STAFF_SESSION_CACHE_TTL_MS,
  });

  return sessionData;
}

function invalidateStaffSessionCache(staffId) {
  const cacheKey = getStaffSessionCacheKey(staffId);
  if (cacheKey) {
    staffSessionCache.delete(cacheKey);
  }
}

async function loadStaffSession(staffId) {
  const cachedStaff = getCachedStaffSession(staffId);
  if (cachedStaff) {
    return cachedStaff;
  }

  const result = await pool.query(
    `
      SELECT
        s.owner_user_id,
        s.name,
        s.username,
        s.is_active,
        s.page_permissions,
        u.name AS owner_name
      FROM staff_accounts s
      JOIN users u ON u.id = s.owner_user_id
      WHERE s.id = $1
      LIMIT 1
    `,
    [staffId],
  );

  if (!result.rowCount) {
    invalidateStaffSessionCache(staffId);
    return null;
  }

  const staff = result.rows[0];
  if (!staff.is_active) {
    invalidateStaffSessionCache(staffId);
    return {
      ownerUserId: staff.owner_user_id,
      name: staff.name,
      username: staff.username,
      isActive: false,
      pagePermissions: staff.page_permissions,
      ownerName: staff.owner_name,
    };
  }

  return setCachedStaffSession(staffId, {
    ownerUserId: staff.owner_user_id,
    name: staff.name,
    username: staff.username,
    isActive: true,
    pagePermissions: staff.page_permissions,
    ownerName: staff.owner_name,
  });
}

async function authMiddleware(req, res, next) {
  try {
    let token = null;

    if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    const header = req.headers.authorization;
    if (!token && header && header.startsWith("Bearer ")) {
      token = header.split(" ")[1];
    }

    if (!token) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (String(decoded.role).toLowerCase() === "staff") {
      const staffId = decoded.actorId || decoded.staffId || decoded.id;
      const staff = await loadStaffSession(staffId);

      if (!staff || !staff.isActive) {
        return res.status(401).json({ error: "Invalid or expired token" });
      }

      req.user = {
        ...decoded,
        actorId: staffId,
        staffId,
        ownerId: staff.ownerUserId,
        role: "staff",
        accountType: "staff",
        name: staff.name,
        username: staff.username,
        ownerName: staff.ownerName,
        permissions: normalizePermissions(
          staff.pagePermissions || DEFAULT_STAFF_PERMISSIONS,
        ),
      };
      return next();
    }

    req.user = {
      ...decoded,
      actorId: decoded.actorId || decoded.id,
      ownerId: decoded.ownerId || decoded.id,
      role: "admin",
      accountType: "admin",
      permissions: ["all"],
    };
    return next();
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("JWT verification failed:", error.message);
    }
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

function getUserId(req) {
  const ownerId = Number(req.user?.ownerId || req.user?.id);
  if (!ownerId) {
    throw new Error("Missing owner user ID in request context");
  }
  return ownerId;
}

function getActorId(req) {
  const actorId = Number(req.user?.actorId || req.user?.id);
  if (!actorId) {
    throw new Error("Missing actor ID in request context");
  }
  return actorId;
}

function isAdminSession(req) {
  return String(req.user?.role || "").toLowerCase() === "admin";
}

function hasPermission(req, ...permissions) {
  if (isAdminSession(req)) {
    return true;
  }

  const currentPermissions = Array.isArray(req.user?.permissions)
    ? req.user.permissions
    : [];

  return permissions.some((permission) => currentPermissions.includes(permission));
}

function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!isAdminSession(req)) {
    return res.status(403).json({ error: "Admin access required" });
  }

  next();
}

function requirePermission(...permissions) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!permissions.length || hasPermission(req, ...permissions)) {
      return next();
    }

    return res.status(403).json({ error: "Access denied" });
  };
}

function allowRoles(...roles) {
  const normalized = roles.map((role) => String(role).toLowerCase());

  return (req, res, next) => {
    const currentRole = String(req.user?.role || "").toLowerCase();
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!normalized.includes(currentRole)) {
      return res.status(403).json({ error: "Access denied" });
    }

    next();
  };
}

module.exports = {
  allowRoles,
  authMiddleware,
  getActorId,
  getUserId,
  hasPermission,
  invalidateStaffSessionCache,
  isAdminSession,
  requireAdmin,
  requirePermission,
};
