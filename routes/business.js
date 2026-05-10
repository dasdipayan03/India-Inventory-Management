const express = require("express");
const pool = require("../db");
const {
  authMiddleware,
  getUserId,
  requirePermission,
} = require("../middleware/auth");
const {
  lockScopedResource,
  normalizeDisplayText,
  normalizeLookupText,
} = require("../utils/concurrency");
const { cacheJsonResponse } = require("../middleware/cache");
const { invalidateUserCache } = require("../utils/cache");
const { buildPaginationMeta, parsePagination } = require("../utils/pagination");

const router = express.Router();

const PAYMENT_MODES = new Set(["cash", "upi", "bank", "mixed", "credit"]);

function parseNonNegativeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function parsePositiveNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
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

function normalizePaymentMode(value, fallback = "cash") {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return PAYMENT_MODES.has(normalized) ? normalized : fallback;
}

function parseDateInput(value) {
  const raw = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  return new Date()
    .toLocaleString("en-CA", { timeZone: "Asia/Kolkata" })
    .slice(0, 10);
}

function toIstStartTimestamp(value) {
  return `${parseDateInput(value)}T00:00:00+05:30`;
}

function toIstDateRange(from, to) {
  const fromDate = parseDateInput(from);
  const toDate = parseDateInput(to);
  return {
    fromDate,
    toDate,
    fromTimestamp: `${fromDate}T00:00:00+05:30`,
    toTimestampExclusive: `${toDate}T23:59:59.999+05:30`,
  };
}

function buildPaymentSnapshot(subtotal, paidInput, fallbackMode = "cash") {
  const total = Number(subtotal) || 0;
  const paymentMode = normalizePaymentMode(fallbackMode, "cash");
  const rawPaidInput = String(paidInput ?? "").trim();
  const normalizedPaid =
    rawPaidInput === "" ? null : parseNonNegativeNumber(paidInput);

  if (total <= 0) {
    return {
      amountPaid: 0,
      amountDue: 0,
      paymentMode,
      paymentStatus: "paid",
    };
  }

  const desiredPaid =
    normalizedPaid === null
      ? paymentMode === "credit"
        ? 0
        : total
      : normalizedPaid;
  const amountPaid = Number(
    Math.min(Math.max(desiredPaid, 0), total).toFixed(2),
  );
  const amountDue = Number((total - amountPaid).toFixed(2));

  let paymentStatus = "paid";
  if (amountDue > 0 && amountPaid > 0) {
    paymentStatus = "partial";
  } else if (amountDue > 0) {
    paymentStatus = "due";
  }

  return {
    amountPaid,
    amountDue,
    paymentMode,
    paymentStatus,
  };
}

async function findOrCreateSupplier(client, userId, payload) {
  const supplierName = normalizeDisplayText(payload.name);
  const supplierMobile = normalizeMobileNumber(payload.mobile_number);
  const supplierAddress = String(payload.address || "").trim();

  if (!supplierName) {
    throw new Error("Supplier name is required");
  }

  if (supplierMobile && !/^\d{10}$/.test(supplierMobile)) {
    throw new Error("Supplier mobile number must be 10 digits");
  }

  await lockScopedResource(
    client,
    userId,
    "supplier",
    supplierMobile || normalizeLookupText(supplierName),
  );

  let existing = null;

  if (supplierMobile) {
    const result = await client.query(
      `
        SELECT id, name, mobile_number, address
        FROM suppliers
        WHERE user_id = $1 AND mobile_number = $2
        ORDER BY id ASC
        LIMIT 1
        FOR UPDATE
      `,
      [userId, supplierMobile],
    );
    existing = result.rows[0] || null;
  }

  if (!existing) {
    const result = await client.query(
      `
        SELECT id, name, mobile_number, address
        FROM suppliers
        WHERE user_id = $1 AND LOWER(TRIM(name)) = $2
        ORDER BY id ASC
        LIMIT 1
        FOR UPDATE
      `,
      [userId, normalizeLookupText(supplierName)],
    );
    existing = result.rows[0] || null;
  }

  if (existing) {
    const updated = await client.query(
      `
        UPDATE suppliers
        SET
          name = $1,
          mobile_number = $2,
          address = $3,
          updated_at = NOW()
        WHERE id = $4 AND user_id = $5
        RETURNING id, name, mobile_number, address
      `,
      [
        supplierName,
        supplierMobile || null,
        supplierAddress || null,
        existing.id,
        userId,
      ],
    );

    return updated.rows[0];
  }

  const inserted = await client.query(
    `
      INSERT INTO suppliers (user_id, name, mobile_number, address)
      VALUES ($1, $2, $3, $4)
      RETURNING id, name, mobile_number, address
    `,
    [userId, supplierName, supplierMobile || null, supplierAddress || null],
  );

  return inserted.rows[0];
}

router.use(authMiddleware);

router.get(
  "/suppliers",
  requirePermission("purchase_entry"),
  cacheJsonResponse({ namespace: "business:suppliers", ttlMs: 15 * 1000 }),
  async (req, res) => {
    try {
      const userId = getUserId(req);
      const query = String(req.query.q || "").trim();
      const params = [userId];
      let whereClause = "";

      if (query) {
        params.push(`%${query}%`);
        whereClause = `
        AND (
          s.name ILIKE $2
          OR COALESCE(s.mobile_number, '') ILIKE $2
        )
      `;
      }

      const result = await pool.query(
        `
        SELECT
          s.id,
          s.name,
          s.mobile_number,
          s.address
        FROM suppliers s
        WHERE s.user_id = $1
        ${whereClause}
        ORDER BY s.updated_at DESC, s.name ASC
        LIMIT 20
      `,
        params,
      );

      res.json(result.rows);
    } catch (error) {
      console.error("Supplier lookup error:", error);
      res.status(500).json({ error: "Failed to load suppliers" });
    }
  },
);

router.post(
  "/purchases",
  requirePermission("purchase_entry"),
  async (req, res) => {
    const client = await pool.connect();

    try {
      const userId = getUserId(req);
      const supplierName = normalizeDisplayText(req.body.supplier_name);
      const supplierNumber = normalizeMobileNumber(req.body.supplier_number);
      const supplierAddress = String(req.body.supplier_address || "").trim();
      const billNo = String(req.body.bill_no || "").trim();
      const purchaseDate = parseDateInput(req.body.purchase_date);
      const note = String(req.body.note || "").trim();
      const paymentMode = normalizePaymentMode(req.body.payment_mode, "cash");
      const items = Array.isArray(req.body.items) ? req.body.items : [];

      if (!supplierName) {
        return res.status(400).json({ error: "Supplier name is required." });
      }

      if (supplierNumber && !/^\d{10}$/.test(supplierNumber)) {
        return res
          .status(400)
          .json({ error: "Supplier mobile number must be 10 digits." });
      }

      if (!items.length) {
        return res
          .status(400)
          .json({ error: "Add at least one purchase item." });
      }

      await client.query("BEGIN");

      const settingsResult = await client.query(
        `
        SELECT default_profit_percent
        FROM settings
        WHERE user_id = $1
        LIMIT 1
      `,
        [userId],
      );

      const defaultProfitPercent =
        Number(settingsResult.rows[0]?.default_profit_percent) || 30;

      const normalizedItems = items.map((item, index) => {
        const itemName = normalizeDisplayText(item.item_name || item.name);
        const lookupKey = normalizeLookupText(itemName);
        const quantity = parsePositiveNumber(item.quantity);
        const buyingRate = parsePositiveNumber(item.buying_rate);
        const sellingRateInput = parseNonNegativeNumber(item.selling_rate);

        if (
          !itemName ||
          !lookupKey ||
          quantity === null ||
          buyingRate === null
        ) {
          throw new Error(`Invalid purchase item at line ${index + 1}`);
        }

        const sellingRate =
          sellingRateInput === null
            ? Number((buyingRate * (1 + defaultProfitPercent / 100)).toFixed(2))
            : Number(sellingRateInput.toFixed(2));
        const lineTotal = Number((quantity * buyingRate).toFixed(2));

        return {
          itemName,
          lookupKey,
          quantity: Number(quantity.toFixed(2)),
          buyingRate: Number(buyingRate.toFixed(2)),
          sellingRate,
          lineTotal,
        };
      });

      const subtotal = Number(
        normalizedItems
          .reduce((sum, item) => sum + item.lineTotal, 0)
          .toFixed(2),
      );

      const payment = buildPaymentSnapshot(
        subtotal,
        req.body.amount_paid,
        paymentMode,
      );

      const supplier = await findOrCreateSupplier(client, userId, {
        name: supplierName,
        mobile_number: supplierNumber,
        address: supplierAddress,
      });

      const purchaseResult = await client.query(
        `
        INSERT INTO purchases (
          user_id,
          supplier_id,
          bill_no,
          purchase_date,
          subtotal,
          amount_paid,
          amount_due,
          payment_mode,
          payment_status,
          note
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id, subtotal, amount_paid, amount_due, payment_status
      `,
        [
          userId,
          supplier.id,
          billNo || null,
          toIstStartTimestamp(purchaseDate),
          subtotal,
          payment.amountPaid,
          payment.amountDue,
          payment.paymentMode,
          payment.paymentStatus,
          note || null,
        ],
      );

      const purchase = purchaseResult.rows[0];

      for (const item of normalizedItems) {
        await client.query(
          `
          INSERT INTO purchase_items (
            purchase_id,
            item_name,
            quantity,
            buying_rate,
            selling_rate,
            line_total
          )
          VALUES ($1, $2, $3, $4, $5, $6)
        `,
          [
            purchase.id,
            item.itemName,
            item.quantity,
            item.buyingRate,
            item.sellingRate,
            item.lineTotal,
          ],
        );

        await lockScopedResource(client, userId, "item-stock", item.lookupKey);

        const existingItem = await client.query(
          `
          SELECT id
          FROM items
          WHERE user_id = $1 AND LOWER(TRIM(name)) = $2
          ORDER BY id ASC
          LIMIT 1
          FOR UPDATE
        `,
          [userId, item.lookupKey],
        );

        if (existingItem.rowCount) {
          await client.query(
            `
            UPDATE items
            SET
              quantity = quantity + $1,
              buying_rate = $2,
              selling_rate = $3,
              updated_at = NOW()
            WHERE id = $4 AND user_id = $5
          `,
            [
              item.quantity,
              item.buyingRate,
              item.sellingRate,
              existingItem.rows[0].id,
              userId,
            ],
          );
        } else {
          await client.query(
            `
            INSERT INTO items (user_id, name, quantity, buying_rate, selling_rate)
            VALUES ($1, $2, $3, $4, $5)
          `,
            [
              userId,
              item.itemName,
              item.quantity,
              item.buyingRate,
              item.sellingRate,
            ],
          );
        }
      }

      await client.query("COMMIT");
      invalidateUserCache(userId);

      res.json({
        success: true,
        message: "Purchase saved and stock updated successfully.",
        purchase: {
          id: purchase.id,
          subtotal: purchase.subtotal,
          amount_paid: purchase.amount_paid,
          amount_due: purchase.amount_due,
          payment_status: purchase.payment_status,
        },
      });
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Purchase rollback error:", rollbackError);
      }

      if (
        error.message.startsWith("Invalid purchase item") ||
        error.message.includes("Supplier")
      ) {
        return res.status(400).json({ error: error.message });
      }

      console.error("Purchase save error:", error);
      res.status(500).json({ error: "Failed to save purchase entry" });
    } finally {
      client.release();
    }
  },
);

router.get(
  "/purchases/report",
  requirePermission("purchase_entry"),
  cacheJsonResponse({ namespace: "business:purchases", ttlMs: 10 * 1000 }),
  async (req, res) => {
    try {
      const userId = getUserId(req);
      const rawQuery = String(req.query.q || "").trim();
      const pagination = parsePagination(req.query, 100, 500, {
        optional: true,
      });
      const { fromDate, toDate, fromTimestamp, toTimestampExclusive } =
        toIstDateRange(req.query.from, req.query.to);

      const params = [userId, fromTimestamp, toTimestampExclusive];
      let searchClause = "";

      if (rawQuery) {
        params.push(`%${rawQuery}%`);
        searchClause = `
        AND (
          COALESCE(s.name, '') ILIKE $4
          OR COALESCE(s.mobile_number, '') ILIKE $4
          OR COALESCE(p.bill_no, '') ILIKE $4
        )
      `;
      }

      const paginationClause = pagination.enabled
        ? `LIMIT ${pagination.limit} OFFSET ${pagination.offset}`
        : "";

      const countResult = pagination.enabled
        ? await pool.query(
            `
        SELECT COUNT(DISTINCT p.id)::int AS total
        FROM purchases p
        JOIN suppliers s
          ON s.id = p.supplier_id
        WHERE p.user_id = $1
          AND p.purchase_date >= $2::timestamptz
          AND p.purchase_date <= $3::timestamptz
          ${searchClause}
      `,
            params,
          )
        : null;

      const result = await pool.query(
        `
        SELECT
          p.id,
          p.bill_no,
          p.purchase_date,
          p.subtotal,
          p.amount_paid,
          p.amount_due,
          p.payment_mode,
          p.payment_status,
          p.note,
          s.id AS supplier_id,
          s.name AS supplier_name,
          s.mobile_number AS supplier_number,
          COUNT(pi.id)::int AS item_count
        FROM purchases p
        JOIN suppliers s
          ON s.id = p.supplier_id
        LEFT JOIN purchase_items pi
          ON pi.purchase_id = p.id
        WHERE p.user_id = $1
          AND p.purchase_date >= $2::timestamptz
          AND p.purchase_date <= $3::timestamptz
          ${searchClause}
        GROUP BY p.id, s.id
        ORDER BY p.purchase_date DESC, p.id DESC
        ${paginationClause}
      `,
        params,
      );

      const payload = {
        success: true,
        range: { from: fromDate, to: toDate },
        purchases: result.rows,
      };
      const paginationMeta = buildPaginationMeta(
        pagination,
        countResult?.rows[0]?.total,
        result.rows.length,
      );
      if (paginationMeta) {
        payload.pagination = paginationMeta;
      }

      res.json(payload);
    } catch (error) {
      console.error("Purchase report error:", error);
      res.status(500).json({ error: "Failed to load purchase report" });
    }
  },
);

router.get(
  "/purchases/product-history",
  requirePermission("purchase_entry"),
  cacheJsonResponse({
    namespace: "business:purchase-product-history",
    ttlMs: 15 * 1000,
  }),
  async (req, res) => {
    try {
      const userId = getUserId(req);
      const itemName = normalizeDisplayText(req.query.item_name);

      if (!itemName) {
        return res.status(400).json({ error: "Product name is required." });
      }

      const result = await pool.query(
        `
        SELECT
          pi.id,
          pi.purchase_id,
          pi.item_name,
          pi.quantity,
          pi.buying_rate,
          pi.selling_rate,
          pi.line_total,
          p.bill_no,
          p.purchase_date,
          p.payment_status,
          s.id AS supplier_id,
          s.name AS supplier_name,
          s.mobile_number AS supplier_number
        FROM purchase_items pi
        JOIN purchases p
          ON p.id = pi.purchase_id
        JOIN suppliers s
          ON s.id = p.supplier_id
        WHERE p.user_id = $1
          AND (
            LOWER(TRIM(pi.item_name)) = LOWER(TRIM($2))
            OR pi.item_name ILIKE $3
          )
        ORDER BY
          CASE
            WHEN LOWER(TRIM(pi.item_name)) = LOWER(TRIM($2)) THEN 0
            ELSE 1
          END,
          p.purchase_date DESC,
          pi.id DESC
        LIMIT 100
      `,
        [userId, itemName, `%${itemName}%`],
      );

      res.json({
        success: true,
        item_name: itemName,
        rows: result.rows,
      });
    } catch (error) {
      console.error("Product purchase history error:", error);
      res
        .status(500)
        .json({ error: "Failed to load product purchase history" });
    }
  },
);

router.get(
  "/purchases/:purchaseId",
  requirePermission("purchase_entry"),
  async (req, res) => {
    try {
      const userId = getUserId(req);
      const purchaseId = Number.parseInt(req.params.purchaseId, 10);

      if (!Number.isInteger(purchaseId) || purchaseId <= 0) {
        return res.status(400).json({ error: "Invalid purchase selection." });
      }

      const result = await pool.query(
        `
        SELECT
          p.id,
          p.bill_no,
          p.purchase_date,
          p.subtotal,
          p.amount_paid,
          p.amount_due,
          p.payment_mode,
          p.payment_status,
          p.note,
          s.id AS supplier_id,
          s.name AS supplier_name,
          s.mobile_number AS supplier_number,
          s.address AS supplier_address,
          COALESCE(
            json_agg(
              json_build_object(
                'id', pi.id,
                'item_name', pi.item_name,
                'quantity', pi.quantity,
                'buying_rate', pi.buying_rate,
                'selling_rate', pi.selling_rate,
                'line_total', pi.line_total
              )
              ORDER BY pi.id
            ) FILTER (WHERE pi.id IS NOT NULL),
            '[]'
          ) AS items
        FROM purchases p
        JOIN suppliers s
          ON s.id = p.supplier_id
        LEFT JOIN purchase_items pi
          ON pi.purchase_id = p.id
        WHERE p.user_id = $1
          AND p.id = $2
        GROUP BY p.id, s.id
        LIMIT 1
      `,
        [userId, purchaseId],
      );

      if (!result.rowCount) {
        return res.status(404).json({ error: "Purchase not found." });
      }

      res.json({
        success: true,
        purchase: result.rows[0],
      });
    } catch (error) {
      console.error("Purchase detail error:", error);
      res.status(500).json({ error: "Failed to load purchase detail" });
    }
  },
);

router.post(
  "/purchases/:purchaseId/repayment",
  requirePermission("purchase_entry"),
  async (req, res) => {
    const client = await pool.connect();

    try {
      const userId = getUserId(req);
      const purchaseId = Number.parseInt(req.params.purchaseId, 10);
      const amount = parsePositiveNumber(req.body.amount);
      const paymentMode = normalizePaymentMode(req.body.payment_mode, "cash");
      const note = String(req.body.note || "").trim();

      if (!Number.isInteger(purchaseId) || purchaseId <= 0) {
        return res.status(400).json({ error: "Invalid purchase selection." });
      }

      if (amount === null) {
        return res
          .status(400)
          .json({ error: "Repayment amount must be greater than zero." });
      }

      await client.query("BEGIN");

      const purchaseResult = await client.query(
        `
          SELECT
            p.id,
            p.bill_no,
            p.amount_paid,
            p.amount_due,
            p.payment_mode,
            p.payment_status,
            p.note,
            s.id AS supplier_id,
            s.name AS supplier_name
          FROM purchases p
          JOIN suppliers s
            ON s.id = p.supplier_id
          WHERE p.user_id = $1
            AND p.id = $2
          LIMIT 1
          FOR UPDATE
        `,
        [userId, purchaseId],
      );

      if (!purchaseResult.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Purchase not found." });
      }

      const purchase = purchaseResult.rows[0];
      const currentDue = Number(purchase.amount_due) || 0;

      if (currentDue <= 0) {
        await client.query("ROLLBACK");
        return res
          .status(400)
          .json({ error: "This purchase already has no due amount." });
      }

      if (amount - currentDue > 0.001) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          error: `Repayment amount cannot be greater than the current due of Rs. ${currentDue.toFixed(2)}.`,
        });
      }

      const nextAmountPaid = Number(
        ((Number(purchase.amount_paid) || 0) + amount).toFixed(2),
      );
      const nextAmountDue = Number((currentDue - amount).toFixed(2));
      const nextPaymentStatus = nextAmountDue > 0 ? "partial" : "paid";
      const previousMode = normalizePaymentMode(purchase.payment_mode, "cash");
      const nextPaymentMode =
        previousMode === "credit"
          ? nextAmountDue > 0
            ? "mixed"
            : paymentMode
          : previousMode === paymentMode
            ? previousMode
            : Number(purchase.amount_paid) > 0
              ? "mixed"
              : paymentMode;

      const repaymentStamp = new Date().toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      const repaymentNote = [
        `Repayment ${amount.toFixed(2)} via ${paymentMode.toUpperCase()} on ${repaymentStamp}`,
        note || "",
      ]
        .filter(Boolean)
        .join(" | ");
      const mergedNote = [String(purchase.note || "").trim(), repaymentNote]
        .filter(Boolean)
        .join("\n");

      await client.query(
        `
          UPDATE purchases
          SET
            amount_paid = $1,
            amount_due = $2,
            payment_mode = $3,
            payment_status = $4,
            note = $5,
            updated_at = NOW()
          WHERE id = $6
            AND user_id = $7
        `,
        [
          nextAmountPaid,
          nextAmountDue,
          nextPaymentMode,
          nextPaymentStatus,
          mergedNote || null,
          purchaseId,
          userId,
        ],
      );

      await client.query("COMMIT");
      invalidateUserCache(userId);

      res.json({
        success: true,
        message:
          nextAmountDue > 0
            ? "Supplier repayment saved. The remaining due is still pending."
            : "Supplier repayment saved and the bill is now fully cleared.",
        purchase: {
          id: purchaseId,
          supplier_id: purchase.supplier_id,
          supplier_name: purchase.supplier_name,
          amount_paid: nextAmountPaid,
          amount_due: nextAmountDue,
          payment_mode: nextPaymentMode,
          payment_status: nextPaymentStatus,
          note: mergedNote,
        },
      });
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Purchase repayment rollback error:", rollbackError);
      }

      console.error("Purchase repayment error:", error);
      res.status(500).json({ error: "Failed to save supplier repayment" });
    } finally {
      client.release();
    }
  },
);

router.get(
  "/suppliers/summary",
  requirePermission("purchase_entry"),
  cacheJsonResponse({
    namespace: "business:supplier-summary",
    ttlMs: 10 * 1000,
  }),
  async (req, res) => {
    try {
      const userId = getUserId(req);
      const rawQuery = String(req.query.q || "").trim();
      const pagination = parsePagination(req.query, 100, 500, {
        optional: true,
      });
      const params = [userId];
      let searchClause = "";

      if (rawQuery) {
        params.push(`%${rawQuery}%`);
        searchClause = `
        AND (
          s.name ILIKE $2
          OR COALESCE(s.mobile_number, '') ILIKE $2
        )
      `;
      }

      const paginationClause = pagination.enabled
        ? `LIMIT ${pagination.limit} OFFSET ${pagination.offset}`
        : "";
      const countResult = pagination.enabled
        ? await pool.query(
            `
        SELECT COUNT(*)::int AS total
        FROM (
          SELECT s.id
          FROM suppliers s
          LEFT JOIN purchases p
            ON p.supplier_id = s.id AND p.user_id = s.user_id
          WHERE s.user_id = $1
            ${searchClause}
          GROUP BY s.id
          HAVING COUNT(p.id) > 0
        ) supplier_summary
      `,
            params,
          )
        : null;

      const result = await pool.query(
        `
        SELECT
          s.id,
          s.name,
          s.mobile_number,
          COUNT(p.id)::int AS purchase_count,
          COALESCE(SUM(p.subtotal), 0) AS total_amount,
          COALESCE(SUM(p.amount_paid), 0) AS total_paid,
          COALESCE(SUM(p.amount_due), 0) AS total_due,
          MAX(p.purchase_date) AS last_purchase_date
        FROM suppliers s
        LEFT JOIN purchases p
          ON p.supplier_id = s.id AND p.user_id = s.user_id
        WHERE s.user_id = $1
          ${searchClause}
        GROUP BY s.id
        HAVING COUNT(p.id) > 0
        ORDER BY COALESCE(SUM(p.amount_due), 0) DESC, MAX(p.purchase_date) DESC NULLS LAST
        ${paginationClause}
      `,
        params,
      );

      const payload = {
        success: true,
        suppliers: result.rows,
      };
      const paginationMeta = buildPaginationMeta(
        pagination,
        countResult?.rows[0]?.total,
        result.rows.length,
      );
      if (paginationMeta) {
        payload.pagination = paginationMeta;
      }

      res.json(payload);
    } catch (error) {
      console.error("Supplier ledger summary error:", error);
      res.status(500).json({ error: "Failed to load supplier summary" });
    }
  },
);

router.get(
  "/suppliers/:supplierId/ledger",
  requirePermission("purchase_entry"),
  cacheJsonResponse({
    namespace: "business:supplier-ledger",
    ttlMs: 10 * 1000,
  }),
  async (req, res) => {
    try {
      const userId = getUserId(req);
      const supplierId = Number.parseInt(req.params.supplierId, 10);
      const pagination = parsePagination(req.query, 100, 500, {
        optional: true,
      });

      if (!Number.isInteger(supplierId) || supplierId <= 0) {
        return res.status(400).json({ error: "Invalid supplier selection." });
      }

      const supplierResult = await pool.query(
        `
        SELECT id, name, mobile_number, address
        FROM suppliers
        WHERE id = $1 AND user_id = $2
        LIMIT 1
      `,
        [supplierId, userId],
      );

      if (!supplierResult.rowCount) {
        return res.status(404).json({ error: "Supplier not found." });
      }

      const paginationClause = pagination.enabled
        ? `LIMIT ${pagination.limit} OFFSET ${pagination.offset}`
        : "";
      const countResult = pagination.enabled
        ? await pool.query(
            `
        SELECT COUNT(*)::int AS total
        FROM purchases p
        WHERE p.user_id = $1
          AND p.supplier_id = $2
      `,
            [userId, supplierId],
          )
        : null;

      const rows = await pool.query(
        `
        SELECT
          p.id,
          p.bill_no,
          p.purchase_date,
          p.subtotal,
          p.amount_paid,
          p.amount_due,
          p.payment_mode,
          p.payment_status,
          p.note,
          COUNT(pi.id)::int AS item_count
        FROM purchases p
        LEFT JOIN purchase_items pi
          ON pi.purchase_id = p.id
        WHERE p.user_id = $1
          AND p.supplier_id = $2
        GROUP BY p.id
        ORDER BY p.purchase_date ASC, p.id ASC
        ${paginationClause}
      `,
        [userId, supplierId],
      );

      const payload = {
        success: true,
        supplier: supplierResult.rows[0],
        ledger: rows.rows,
      };
      const paginationMeta = buildPaginationMeta(
        pagination,
        countResult?.rows[0]?.total,
        rows.rows.length,
      );
      if (paginationMeta) {
        payload.pagination = paginationMeta;
      }

      res.json(payload);
    } catch (error) {
      console.error("Supplier ledger detail error:", error);
      res.status(500).json({ error: "Failed to load supplier ledger" });
    }
  },
);

router.post(
  "/expenses",
  requirePermission("expense_tracking"),
  async (req, res) => {
    try {
      const userId = getUserId(req);
      const title = normalizeDisplayText(req.body.title);
      const category = normalizeDisplayText(req.body.category);
      const amount = parsePositiveNumber(req.body.amount);
      const paymentMode = normalizePaymentMode(req.body.payment_mode, "cash");
      const expenseDate = parseDateInput(req.body.expense_date);
      const note = String(req.body.note || "").trim();

      if (!title) {
        return res.status(400).json({ error: "Expense title is required." });
      }

      if (!category) {
        return res.status(400).json({ error: "Expense category is required." });
      }

      if (amount === null) {
        return res
          .status(400)
          .json({ error: "Expense amount must be greater than zero." });
      }

      const result = await pool.query(
        `
        INSERT INTO expenses (
          user_id,
          title,
          category,
          amount,
          payment_mode,
          expense_date,
          note
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, title, category, amount, payment_mode, expense_date
      `,
        [
          userId,
          title,
          category,
          Number(amount.toFixed(2)),
          paymentMode,
          toIstStartTimestamp(expenseDate),
          note || null,
        ],
      );

      invalidateUserCache(userId);
      res.json({
        success: true,
        message: "Expense saved successfully.",
        expense: result.rows[0],
      });
    } catch (error) {
      console.error("Expense save error:", error);
      res.status(500).json({ error: "Failed to save expense" });
    }
  },
);

router.get(
  "/expenses/suggestions",
  requirePermission("expense_tracking"),
  cacheJsonResponse({
    namespace: "business:expense-suggestions",
    ttlMs: 15 * 1000,
  }),
  async (req, res) => {
    try {
      const userId = getUserId(req);
      const rawQuery = String(req.query.q || "").trim();

      if (!rawQuery) {
        return res.json([]);
      }

      const result = await pool.query(
        `
        SELECT value, type
        FROM (
          SELECT DISTINCT TRIM(e.title) AS value, 'Title' AS type, 1 AS sort_order
          FROM expenses e
          WHERE e.user_id = $1
            AND TRIM(COALESCE(e.title, '')) <> ''
            AND e.title ILIKE $2

          UNION

          SELECT DISTINCT TRIM(e.category) AS value, 'Category' AS type, 2 AS sort_order
          FROM expenses e
          WHERE e.user_id = $1
            AND TRIM(COALESCE(e.category, '')) <> ''
            AND e.category ILIKE $2
        ) suggestions
        ORDER BY sort_order ASC, value ASC
        LIMIT 12
      `,
        [userId, `%${rawQuery}%`],
      );

      res.json(result.rows);
    } catch (error) {
      console.error("Expense suggestions error:", error);
      res.status(500).json({ error: "Failed to load expense suggestions" });
    }
  },
);

router.get(
  "/expenses/report",
  requirePermission("expense_tracking"),
  cacheJsonResponse({ namespace: "business:expense-report", ttlMs: 10 * 1000 }),
  async (req, res) => {
    try {
      const userId = getUserId(req);
      const rawQuery = String(req.query.q || "").trim();
      const pagination = parsePagination(req.query, 100, 500, {
        optional: true,
      });
      const { fromDate, toDate, fromTimestamp, toTimestampExclusive } =
        toIstDateRange(req.query.from, req.query.to);

      const baseParams = [userId, fromTimestamp, toTimestampExclusive];
      let searchClause = "";

      if (rawQuery) {
        baseParams.push(`%${rawQuery}%`);
        searchClause = `
        AND (
          e.title ILIKE $4
          OR e.category ILIKE $4
          OR COALESCE(e.note, '') ILIKE $4
        )
      `;
      }

      const paginationClause = pagination.enabled
        ? `LIMIT ${pagination.limit} OFFSET ${pagination.offset}`
        : "";
      const countResult = pagination.enabled
        ? await pool.query(
            `
        SELECT COUNT(*)::int AS total
        FROM expenses e
        WHERE e.user_id = $1
          AND e.expense_date >= $2::timestamptz
          AND e.expense_date <= $3::timestamptz
          ${searchClause}
      `,
            baseParams,
          )
        : null;

      const rowsResult = await pool.query(
        `
        SELECT
          e.id,
          e.title,
          e.category,
          e.amount,
          e.payment_mode,
          e.expense_date,
          e.note
        FROM expenses e
        WHERE e.user_id = $1
          AND e.expense_date >= $2::timestamptz
          AND e.expense_date <= $3::timestamptz
          ${searchClause}
        ORDER BY e.expense_date DESC, e.id DESC
        ${paginationClause}
      `,
        baseParams,
      );

      const summaryParams = [userId, fromTimestamp, toTimestampExclusive];
      let summarySearchClause = "";

      if (rawQuery) {
        summaryParams.push(`%${rawQuery}%`);
        summarySearchClause = `
        AND (
          e.title ILIKE $4
          OR e.category ILIKE $4
          OR COALESCE(e.note, '') ILIKE $4
        )
      `;
      }

      const summaryResult = await pool.query(
        `
        WITH filtered_expenses AS (
          SELECT e.*
          FROM expenses e
          WHERE e.user_id = $1
            AND e.expense_date >= $2::timestamptz
            AND e.expense_date <= $3::timestamptz
            ${summarySearchClause}
        ),
        expense_totals AS (
          SELECT
            COALESCE(SUM(amount), 0) AS total_expense,
            COUNT(*)::int AS entry_count
          FROM filtered_expenses
        ),
        top_category AS (
          SELECT
            category,
            SUM(amount) AS total
          FROM filtered_expenses
          GROUP BY category
          ORDER BY SUM(amount) DESC, category ASC
          LIMIT 1
        ),
        gross_profit AS (
          SELECT
            COALESCE(SUM((selling_price - cost_price) * quantity), 0) AS gross_profit
          FROM sales
          WHERE user_id = $1
            AND created_at >= $2::timestamptz
            AND created_at <= $3::timestamptz
        )
        SELECT
          expense_totals.total_expense,
          expense_totals.entry_count,
          COALESCE(top_category.category, 'No expenses') AS top_category,
          COALESCE(top_category.total, 0) AS top_category_total,
          gross_profit.gross_profit
        FROM expense_totals
        CROSS JOIN gross_profit
        LEFT JOIN top_category ON TRUE
      `,
        summaryParams,
      );

      const summary = summaryResult.rows[0] || {};
      const totalExpense = Number(summary.total_expense) || 0;
      const grossProfit = Number(summary.gross_profit) || 0;

      const payload = {
        success: true,
        range: { from: fromDate, to: toDate },
        expenses: rowsResult.rows,
        summary: {
          entry_count: Number(summary.entry_count) || 0,
          total_expense: totalExpense,
          top_category: summary.top_category || "No expenses",
          top_category_total: Number(summary.top_category_total) || 0,
          gross_profit: grossProfit,
          net_profit: Number((grossProfit - totalExpense).toFixed(2)),
        },
      };
      const paginationMeta = buildPaginationMeta(
        pagination,
        countResult?.rows[0]?.total,
        rowsResult.rows.length,
      );
      if (paginationMeta) {
        payload.pagination = paginationMeta;
      }

      res.json(payload);
    } catch (error) {
      console.error("Expense report error:", error);
      res.status(500).json({ error: "Failed to load expense report" });
    }
  },
);

module.exports = router;
