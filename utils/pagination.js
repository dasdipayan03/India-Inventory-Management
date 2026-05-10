function parsePagination(
  query,
  defaultLimit = 100,
  maxLimit = 500,
  options = {},
) {
  const optional = Boolean(options.optional);
  const requested =
    Object.prototype.hasOwnProperty.call(query, "limit") ||
    Object.prototype.hasOwnProperty.call(query, "page") ||
    Object.prototype.hasOwnProperty.call(query, "offset");

  if (optional && !requested) {
    return { enabled: false, limit: null, offset: 0, page: 1 };
  }

  const rawLimit = Number.parseInt(query.limit, 10);
  const limit = Math.min(
    Math.max(Number.isInteger(rawLimit) ? rawLimit : defaultLimit, 1),
    maxLimit,
  );
  const rawPage = Number.parseInt(query.page, 10);
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const rawOffset = Number.parseInt(query.offset, 10);
  const offset =
    Number.isInteger(rawOffset) && rawOffset >= 0
      ? rawOffset
      : (page - 1) * limit;

  return { enabled: true, limit, offset, page };
}

function buildPaginationMeta(pagination, total, rowCount) {
  if (!pagination.enabled) {
    return null;
  }

  const normalizedTotal = Number(total) || 0;
  return {
    total: normalizedTotal,
    limit: pagination.limit,
    offset: pagination.offset,
    page: pagination.page,
    has_more: pagination.offset + rowCount < normalizedTotal,
  };
}

function setPaginationHeaders(res, pagination, total, rowCount) {
  if (!pagination.enabled) {
    return;
  }

  const normalizedTotal = Number(total) || 0;
  res.setHeader("X-Total-Count", String(normalizedTotal));
  res.setHeader("X-Limit", String(pagination.limit));
  res.setHeader("X-Offset", String(pagination.offset));
  res.setHeader(
    "X-Has-More",
    pagination.offset + rowCount < normalizedTotal ? "true" : "false",
  );
}

module.exports = {
  buildPaginationMeta,
  parsePagination,
  setPaginationHeaders,
};
