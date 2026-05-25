const REDACTED_VALUE = "[REDACTED]";
const sensitiveKeyFragments = [
  "password",
  "token",
  "secret",
  "authorization",
  "cookie",
  "apikey",
  "api_key",
  "accesskey",
  "access_key",
  "jwt",
];

function isSensitiveKey(key) {
  const normalizedKey = String(key || "")
    .trim()
    .toLowerCase();

  if (!normalizedKey) {
    return false;
  }

  return sensitiveKeyFragments.some((fragment) =>
    normalizedKey.includes(fragment),
  );
}

function normalizeError(error) {
  if (!error) {
    return null;
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      code: error.code || null,
      stack: error.stack || null,
    };
  }

  return {
    message: String(error),
  };
}

function sanitizeValue(value, depth = 0) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Error) {
    return normalizeError(value);
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => sanitizeValue(entry, depth + 1))
      .filter((entry) => entry !== undefined);
  }

  if (typeof value === "object") {
    if (depth >= 4) {
      return "[MaxDepth]";
    }

    const sanitized = {};

    for (const [key, entry] of Object.entries(value)) {
      if (isSensitiveKey(key)) {
        sanitized[key] = REDACTED_VALUE;
        continue;
      }

      const normalizedEntry = sanitizeValue(entry, depth + 1);
      if (normalizedEntry !== undefined) {
        sanitized[key] = normalizedEntry;
      }
    }

    return sanitized;
  }

  return String(value);
}

function logEvent(level, event, meta = {}) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    event,
  };

  const sanitizedMeta = sanitizeValue(meta);
  if (sanitizedMeta && typeof sanitizedMeta === "object") {
    Object.assign(entry, sanitizedMeta);
  }

  const serialized = JSON.stringify(entry);

  if (level === "error") {
    console.error(serialized);
    return;
  }

  if (level === "warn") {
    console.warn(serialized);
    return;
  }

  console.log(serialized);
}

module.exports = {
  logEvent,
  normalizeError,
};
