function normalizeLookupText(value) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeDisplayText(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function hashTextToInt(value) {
  const input = String(value ?? "");
  let hash = 0x811c9dc5;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return hash | 0;
}

async function lockScopedResource(client, ownerId, namespace, resourceId) {
  const scopedOwnerId = Number(ownerId);

  if (!Number.isInteger(scopedOwnerId) || scopedOwnerId <= 0) {
    throw new Error("Invalid owner scope for advisory lock");
  }

  const lockKey = hashTextToInt(
    `${String(namespace || "resource")}::${normalizeLookupText(resourceId)}`,
  );

  await client.query("SELECT pg_advisory_xact_lock($1, $2)", [
    scopedOwnerId,
    lockKey,
  ]);
}

module.exports = {
  lockScopedResource,
  normalizeDisplayText,
  normalizeLookupText,
};
