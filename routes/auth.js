const express = require("express");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const pool = require("../db");
const {
  DEFAULT_STAFF_PERMISSIONS,
  STAFF_PAGE_PERMISSIONS,
  normalizePermissions,
} = require("../public/js/permission-contract");
const {
  authMiddleware,
  getUserId,
  invalidateStaffSessionCache,
  requireOwner,
} = require("../middleware/auth");

const router = express.Router();

const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const RESET_TOKEN_BYTES = 32;
const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{3,30}$/;
const MOBILE_NUMBER_PATTERN = /^\d{10}$/;
const PUBLIC_BASE_URL = normalizeBaseUrl(process.env.BASE_URL);

if (!process.env.JWT_SECRET) {
  console.error("JWT_SECRET not found in environment variables.");
  process.exit(1);
}

const loginAttemptLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    error: "Too many login attempts. Please wait 15 minutes and try again.",
  },
});

const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error:
      "Too many password reset attempts. Please wait a few minutes and try again.",
  },
});

function normalizeBaseUrl(value) {
  const rawValue = String(value || "").trim();
  if (!rawValue) {
    return "";
  }

  try {
    return new URL(rawValue).toString().replace(/\/+$/, "");
  } catch (_error) {
    return "";
  }
}

function resolvePublicBaseUrl(req) {
  if (PUBLIC_BASE_URL) {
    return PUBLIC_BASE_URL;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("BASE_URL must be configured in production");
  }

  return `${req.protocol}://${req.get("host")}`;
}

function getSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  };
}

function hashResetToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function markSensitiveResponse(res) {
  res.set("Cache-Control", "no-store");
}

function normalizeName(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeMobileNumber(value) {
  const digits = String(value || "").replace(/\D+/g, "");

  if (digits.length === 12 && digits.startsWith("91")) {
    return digits.slice(2);
  }

  if (digits.length === 11 && digits.startsWith("0")) {
    return digits.slice(1);
  }

  return digits;
}

function isValidMobileNumber(value) {
  return MOBILE_NUMBER_PATTERN.test(value);
}

function normalizeUsername(value) {
  return String(value || "").replace(/\s+/g, "").trim().toLowerCase();
}

function signSession(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "1d" });
}

function setSessionCookie(res, token) {
  res.cookie("token", token, {
    ...getSessionCookieOptions(),
    maxAge: SESSION_MAX_AGE_MS,
  });
}

function clearSessionCookie(res) {
  res.clearCookie("token", getSessionCookieOptions());
}

function normalizeSessionRole(value) {
  return String(value || "").trim().toLowerCase() === "staff"
    ? "staff"
    : "owner";
}

function buildOwnerSession(user) {
  return {
    actorId: user.id,
    ownerId: user.id,
    role: "owner",
    accountType: "owner",
    name: user.name,
    email: user.email,
    ownerName: user.name,
  };
}

function buildStaffSession(staff) {
  return {
    actorId: staff.id,
    staffId: staff.id,
    ownerId: staff.owner_user_id,
    role: "staff",
    accountType: "staff",
    name: staff.name,
    username: staff.username,
    ownerName: staff.owner_name,
    ownerEmail: staff.owner_email,
    permissions: normalizePermissions(
      staff.page_permissions || DEFAULT_STAFF_PERMISSIONS,
    ),
  };
}

function toClientUser(session) {
  const normalizedRole = normalizeSessionRole(session.role);
  return {
    id: session.actorId,
    actorId: session.actorId,
    ownerId: session.ownerId,
    role: normalizedRole,
    accountType: normalizedRole,
    name: session.name,
    email: session.email || null,
    username: session.username || null,
    ownerName: session.ownerName || session.name,
    permissions:
      normalizedRole === "owner"
        ? ["all"]
        : normalizePermissions(session.permissions || DEFAULT_STAFF_PERMISSIONS),
  };
}

async function getOwnersByIdentifier(identifier) {
  const rawIdentifier = String(identifier || "").trim();
  const email = normalizeEmail(rawIdentifier);
  const mobileNumber = rawIdentifier.includes("@")
    ? ""
    : normalizeMobileNumber(rawIdentifier);
  const result = await pool.query(
    `SELECT id, name, email, mobile_number, password_hash
     FROM users
     WHERE LOWER(email) = LOWER($1)
        OR ($2 <> '' AND mobile_number = $2)
     ORDER BY id ASC
     LIMIT 2`,
    [email, isValidMobileNumber(mobileNumber) ? mobileNumber : ""],
  );

  return result.rows;
}

async function getStaffByUsername(username) {
  const result = await pool.query(
    `
      SELECT
        s.id,
        s.owner_user_id,
        s.name,
        s.username,
        s.password_hash,
        s.page_permissions,
        s.is_active,
        u.name AS owner_name,
        u.email AS owner_email
      FROM staff_accounts s
      JOIN users u ON u.id = s.owner_user_id
      WHERE LOWER(TRIM(s.username)) = LOWER(TRIM($1))
      LIMIT 1
    `,
    [username],
  );

  return result.rows[0] || null;
}

router.post("/register", async (req, res) => {
  try {
    const name = normalizeName(req.body.name);
    const email = normalizeEmail(req.body.email);
    const mobileNumber = normalizeMobileNumber(
      req.body.mobileNumber || req.body.mobile_number,
    );
    const password = String(req.body.password || "");

    if (!name || !email || !mobileNumber || !password) {
      return res.status(400).json({ error: "All fields required" });
    }

    if (!isValidMobileNumber(mobileNumber)) {
      return res
        .status(400)
        .json({ error: "Enter a valid 10-digit mobile number" });
    }

    if (password.length < 6) {
      return res
        .status(400)
        .json({ error: "Password must be at least 6 characters" });
    }

    const existing = await pool.query(
      `
        SELECT id, email, mobile_number
        FROM users
        WHERE LOWER(email) = LOWER($1) OR mobile_number = $2
        LIMIT 1
      `,
      [email, mobileNumber],
    );
    if (existing.rowCount > 0) {
      const existingUser = existing.rows[0];
      const errorMessage =
        normalizeEmail(existingUser.email) === email
          ? "Email already registered"
          : "Mobile number already registered";
      return res.status(400).json({ error: errorMessage });
    }

    const password_hash = await bcrypt.hash(password, 12);
    await pool.query(
      `
        INSERT INTO users (name, email, mobile_number, password_hash)
        VALUES ($1, $2, $3, $4)
      `,
      [name, email, mobileNumber, password_hash],
    );

    return res.json({ message: "Account created. You can now log in." });
  } catch (err) {
    console.error("Register error:", err.message);
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/login", loginAttemptLimiter, async (req, res) => {
  try {
    const identifier = String(
      req.body.identifier || req.body.email || "",
    ).trim();
    const password = String(req.body.password || "");
    const normalizedMobileNumber = identifier.includes("@")
      ? ""
      : normalizeMobileNumber(identifier);

    if (!identifier || !password) {
      return res.status(400).json({ error: "All fields required" });
    }

    if (!identifier.includes("@") && !isValidMobileNumber(normalizedMobileNumber)) {
      return res.status(400).json({
        error: "Enter a valid email address or 10-digit mobile number",
      });
    }

    const users = await getOwnersByIdentifier(identifier);
    if (users.length > 1 && isValidMobileNumber(normalizedMobileNumber)) {
      return res.status(400).json({
        error:
          "This mobile number is linked to multiple accounts. Please log in with email.",
      });
    }

    const user = users[0] || null;
    if (!user) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    const session = buildOwnerSession(user);
    const token = signSession(session);
    markSensitiveResponse(res);
    setSessionCookie(res, token);

    return res.json({
      message: "Login successful",
      user: toClientUser(session),
    });
  } catch (err) {
    console.error("Login error:", err.message);
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/staff/login", loginAttemptLimiter, async (req, res) => {
  try {
    const username = normalizeUsername(req.body.username);
    const password = String(req.body.password || "");

    if (!username || !password) {
      return res.status(400).json({ error: "All fields required" });
    }

    const staff = await getStaffByUsername(username);
    if (!staff || !staff.is_active) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    const valid = await bcrypt.compare(password, staff.password_hash);
    if (!valid) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    const session = buildStaffSession(staff);
    const token = signSession(session);
    markSensitiveResponse(res);
    setSessionCookie(res, token);
    invalidateStaffSessionCache(staff.id);

    return res.json({
      message: "Staff login successful",
      user: toClientUser(session),
    });
  } catch (err) {
    console.error("Staff login error:", err.message);
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/logout", (req, res) => {
  markSensitiveResponse(res);
  clearSessionCookie(res);
  return res.json({ message: "Logged out successfully" });
});

router.post("/forgot-password", passwordResetLimiter, async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);

    if (!email) {
      return res.status(400).json({ error: "Email required" });
    }

    const genericMessage = {
      message: "If account exists, reset link has been sent.",
    };

    const result = await pool.query(
      "SELECT id FROM users WHERE LOWER(email) = LOWER($1)",
      [email],
    );

    if (result.rowCount === 0) {
      return res.json(genericMessage);
    }

    const reset_token = crypto.randomBytes(RESET_TOKEN_BYTES).toString("hex");
    const reset_token_hash = hashResetToken(reset_token);
    const expires = new Date(Date.now() + 1000 * 60 * 15);

    await pool.query(
      "UPDATE users SET reset_token=$1, reset_token_expires=$2 WHERE LOWER(email)=LOWER($3)",
      [reset_token_hash, expires, email],
    );

    const baseUrl = resolvePublicBaseUrl(req);
    const resetLink = `${baseUrl}/reset.html#token=${encodeURIComponent(reset_token)}&email=${encodeURIComponent(email)}`;

    if (process.env.MAIL_RELAY_URL && process.env.MAIL_RELAY_KEY) {
      const relayResponse = await fetch(process.env.MAIL_RELAY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: process.env.MAIL_RELAY_KEY,
          to: email,
          subject: "Reset your password",
          html: `
            <p>You requested a password reset.</p>
            <p><a href="${resetLink}">Reset Password</a></p>
            <p>Valid for 15 minutes.</p>
          `,
        }),
      });

      if (!relayResponse.ok) {
        console.error(
          "Mail relay request failed with status:",
          relayResponse.status,
        );
      }
    } else {
      console.error(
        "Mail relay configuration missing. Reset email was not sent for:",
        email,
      );
    }

    return res.json(genericMessage);
  } catch (err) {
    console.error("Forgot password error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/reset-password", passwordResetLimiter, async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const token = String(req.body.token || "");
    const newPassword = String(req.body.newPassword || "");

    if (!email || !token || !newPassword) {
      return res.status(400).json({ error: "All fields required" });
    }

    if (newPassword.length < 6) {
      return res
        .status(400)
        .json({ error: "Password must be at least 6 characters" });
    }

    const tokenHash = hashResetToken(token);

    const result = await pool.query(
      `
        SELECT id, reset_token_expires
        FROM users
        WHERE LOWER(email)=LOWER($1) AND reset_token=$2
      `,
      [email, tokenHash],
    );

    if (result.rowCount === 0) {
      return res.status(400).json({ error: "Invalid token or email" });
    }

    const user = result.rows[0];
    if (new Date(user.reset_token_expires) < new Date()) {
      return res.status(400).json({ error: "Reset token expired" });
    }

    const password_hash = await bcrypt.hash(newPassword, 12);
    await pool.query(
      `
        UPDATE users
        SET password_hash=$1, reset_token=NULL, reset_token_expires=NULL
        WHERE id=$2
      `,
      [password_hash, user.id],
    );

    return res.json({
      message: "Password reset successful. You can now log in.",
    });
  } catch (err) {
    console.error("Reset password error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.get("/staff", authMiddleware, requireOwner, async (req, res) => {
  try {
    const ownerId = getUserId(req);
    const result = await pool.query(
      `
        SELECT id, name, username, page_permissions, is_active, created_at
        FROM staff_accounts
        WHERE owner_user_id = $1
        ORDER BY created_at ASC, id ASC
      `,
      [ownerId],
    );

    return res.json({
      staff: result.rows.map((row) => ({
        ...row,
        permissions: normalizePermissions(
          row.page_permissions || DEFAULT_STAFF_PERMISSIONS,
        ),
      })),
      permissionOptions: STAFF_PAGE_PERMISSIONS,
      limit: 2,
      remaining: Math.max(2 - result.rowCount, 0),
    });
  } catch (error) {
    console.error("Staff list error:", error.message);
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/staff", authMiddleware, requireOwner, async (req, res) => {
  try {
    const ownerId = getUserId(req);
    const name = normalizeName(req.body.name);
    const username = normalizeUsername(req.body.username);
    const password = String(req.body.password || "");
    const permissions = normalizePermissions(
      req.body.permissions || DEFAULT_STAFF_PERMISSIONS,
    );

    if (!name || !username || !password) {
      return res.status(400).json({ error: "All fields required" });
    }

    if (!USERNAME_PATTERN.test(username)) {
      return res.status(400).json({
        error:
          "Username must be 3-30 characters and can use letters, numbers, dot, underscore, or hyphen",
      });
    }

    if (password.length < 6) {
      return res
        .status(400)
        .json({ error: "Password must be at least 6 characters" });
    }

    if (!permissions.length) {
      return res
        .status(400)
        .json({ error: "Select at least one page access for the staff account" });
    }

    const currentStaff = await pool.query(
      "SELECT COUNT(*)::int AS total FROM staff_accounts WHERE owner_user_id = $1",
      [ownerId],
    );

    if ((currentStaff.rows[0]?.total || 0) >= 2) {
      return res.status(400).json({
        error: "Maximum 2 staff accounts allowed for one owner account",
      });
    }

    const existing = await pool.query(
      `
        SELECT id
        FROM staff_accounts
        WHERE LOWER(TRIM(username)) = LOWER(TRIM($1))
        LIMIT 1
      `,
      [username],
    );

    if (existing.rowCount > 0) {
      return res.status(400).json({ error: "Username already in use" });
    }

    const password_hash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      `
        INSERT INTO staff_accounts (
          owner_user_id,
          name,
          username,
          password_hash,
          page_permissions
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, name, username, page_permissions, is_active, created_at
      `,
      [ownerId, name, username, password_hash, permissions],
    );

    return res.json({
      message: "Staff account created successfully",
      staff: {
        ...result.rows[0],
        permissions: normalizePermissions(result.rows[0].page_permissions),
      },
    });
  } catch (error) {
    console.error("Staff create error:", error.message);
    return res.status(500).json({ error: "Server error" });
  }
});

router.patch("/staff/:staffId/permissions", authMiddleware, requireOwner, async (req, res) => {
  try {
    const ownerId = getUserId(req);
    const staffId = Number.parseInt(req.params.staffId, 10);
    const permissions = normalizePermissions(req.body.permissions || []);

    if (!Number.isInteger(staffId) || staffId <= 0) {
      return res.status(400).json({ error: "Invalid staff account" });
    }

    if (!permissions.length) {
      return res
        .status(400)
        .json({ error: "Select at least one page access for the staff account" });
    }

    const result = await pool.query(
      `
        UPDATE staff_accounts
        SET page_permissions = $1, updated_at = NOW()
        WHERE id = $2 AND owner_user_id = $3
        RETURNING id, name, username, page_permissions, is_active, created_at
      `,
      [permissions, staffId, ownerId],
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: "Staff account not found" });
    }

    invalidateStaffSessionCache(staffId);

    return res.json({
      message: "Staff page access updated successfully",
      staff: {
        ...result.rows[0],
        permissions: normalizePermissions(result.rows[0].page_permissions),
      },
    });
  } catch (error) {
    console.error("Staff permission update error:", error.message);
    return res.status(500).json({ error: "Server error" });
  }
});

router.delete("/staff/:staffId", authMiddleware, requireOwner, async (req, res) => {
  try {
    const ownerId = getUserId(req);
    const staffId = Number.parseInt(req.params.staffId, 10);

    if (!Number.isInteger(staffId) || staffId <= 0) {
      return res.status(400).json({ error: "Invalid staff account" });
    }

    const result = await pool.query(
      `
        DELETE FROM staff_accounts
        WHERE id = $1 AND owner_user_id = $2
        RETURNING id
      `,
      [staffId, ownerId],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Staff account not found" });
    }

    invalidateStaffSessionCache(staffId);

    return res.json({ message: "Staff account removed successfully" });
  } catch (error) {
    console.error("Staff delete error:", error.message);
    return res.status(500).json({ error: "Server error" });
  }
});

router.get("/me", authMiddleware, async (req, res) => {
  try {
    markSensitiveResponse(res);
    if (req.user.role === "staff") {
      return res.json(toClientUser(req.user));
    }

    const result = await pool.query(
      "SELECT id, name, email FROM users WHERE id = $1 LIMIT 1",
      [req.user.actorId || req.user.id],
    );

    if (!result.rowCount) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    const user = result.rows[0];
    return res.json(toClientUser(buildOwnerSession(user)));
  } catch (err) {
    console.error("/me error:", err.message);
    return res.status(401).json({ error: "Unauthorized" });
  }
});

module.exports = router;
