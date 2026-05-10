// routes/invoices.js
const express = require("express");
const router = express.Router();
const PDFDocument = require("pdfkit");
const pool = require("../db");
const {
  authMiddleware,
  getUserId,
  requireOwner,
  requirePermission,
} = require("../middleware/auth");
const {
  lockScopedResource,
  normalizeDisplayText,
  normalizeLookupText,
} = require("../utils/concurrency");
const { cacheJsonResponse } = require("../middleware/cache");
const { invalidateUserCache } = require("../utils/cache");
const { parsePagination } = require("../utils/pagination");

/* ---------------------- Helper: pad serial ---------------------- */
function padSerial(n) {
  return String(n).padStart(4, "0");
}

function parsePositiveNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseNonZeroNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed !== 0 ? parsed : null;
}

function parseNonNegativeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
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

const INVOICE_PAYMENT_MODES = new Set(["cash", "upi", "bank", "mixed"]);

function normalizeInvoicePaymentMode(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return INVOICE_PAYMENT_MODES.has(normalized) ? normalized : "cash";
}

function calculateSaleGstAmount(baseAmount, gstRate) {
  const normalizedBaseAmount = Number(baseAmount) || 0;
  const normalizedGstRate = Number(gstRate) || 0;
  return Number(((normalizedBaseAmount * normalizedGstRate) / 100).toFixed(2));
}

function buildInvoicePaymentSnapshot(
  totalAmount,
  amountPaidInput,
  paymentModeInput,
) {
  const normalizedTotal = Number(totalAmount) || 0;

  if (normalizedTotal <= 0) {
    return {
      amountPaid: 0,
      amountDue: 0,
      paymentMode: normalizeInvoicePaymentMode(paymentModeInput),
      paymentStatus: "return",
    };
  }

  const normalizedPaid = parseNonNegativeNumber(amountPaidInput);
  const amountPaid = Number(
    Math.min(
      Math.max(normalizedPaid === null ? normalizedTotal : normalizedPaid, 0),
      normalizedTotal,
    ).toFixed(2),
  );
  const amountDue = Number((normalizedTotal - amountPaid).toFixed(2));

  let paymentStatus = "paid";
  if (amountDue > 0 && amountPaid > 0) {
    paymentStatus = "partial";
  } else if (amountDue > 0) {
    paymentStatus = "due";
  }

  return {
    amountPaid,
    amountDue,
    paymentMode: normalizeInvoicePaymentMode(paymentModeInput),
    paymentStatus,
  };
}

function buildInvoiceSettlementSnapshot(
  invoiceRow,
  paymentAmountInput,
  paymentModeInput,
) {
  const currentPaid = Number(invoiceRow?.amount_paid || 0);
  const currentDue = Number(invoiceRow?.amount_due || 0);
  const amountInput = parsePositiveNumber(paymentAmountInput);

  if (amountInput === null) {
    throw new Error("Payment amount must be greater than zero.");
  }

  if (currentDue <= 0) {
    throw new Error("This invoice is already fully paid.");
  }

  if (amountInput - currentDue > 0.009) {
    throw new Error(
      "Payment amount cannot be greater than the outstanding due.",
    );
  }

  const nextAmountPaid = Number((currentPaid + amountInput).toFixed(2));
  const remainingDue = Number((currentDue - amountInput).toFixed(2));
  const nextAmountDue = remainingDue <= 0.009 ? 0 : remainingDue;
  const incomingMode = normalizeInvoicePaymentMode(paymentModeInput);
  const currentMode = normalizeInvoicePaymentMode(invoiceRow?.payment_mode);

  return {
    amountReceived: Number(amountInput.toFixed(2)),
    amountPaid: nextAmountPaid,
    amountDue: nextAmountDue,
    paymentStatus: nextAmountDue > 0 ? "partial" : "paid",
    paymentMode:
      currentPaid <= 0 || currentMode === incomingMode ? incomingMode : "mixed",
  };
}

const RETRYABLE_INVOICE_PG_CODES = new Set(["23505", "40001", "40P01"]);

function isRetryableInvoiceWriteError(error) {
  if (!error || !RETRYABLE_INVOICE_PG_CODES.has(error.code)) {
    return false;
  }

  if (error.code !== "23505") {
    return true;
  }

  const constraint = String(error.constraint || "").toLowerCase();
  const detail = String(error.detail || "").toLowerCase();
  const message = String(error.message || "").toLowerCase();

  return (
    constraint.includes("invoice_no") ||
    detail.includes("invoice_no") ||
    message.includes("invoice_no")
  );
}

/* ---------------------- Generate Invoice No ---------------------- */
async function generateInvoiceNoWithClient(client, userId) {
  const todayDate = new Date()
    .toLocaleString("en-CA", { timeZone: "Asia/Kolkata" })
    .slice(0, 10);

  const dateKey = todayDate;
  const datePart = todayDate.replace(/-/g, "");

  const q = `
      INSERT INTO user_invoice_counter (user_id, date_key, next_no)
      VALUES ($1, $2, 2)
      ON CONFLICT (user_id, date_key)
      DO UPDATE SET next_no = user_invoice_counter.next_no + 1
      RETURNING next_no;
    `;

  const r = await client.query(q, [userId, dateKey]);
  const assignedSerial = Number(r.rows[0].next_no) - 1;
  const seqStr = padSerial(assignedSerial);

  return {
    invoiceNo: `INV-${datePart}-${userId}-${seqStr}`,
    dateKey,
  };
}

/* ---------------------- GET: Preview Next Invoice ---------------------- */
router.get(
  "/invoices/new",
  authMiddleware,
  requirePermission("sale_invoice"),
  async (req, res) => {
    const userId = getUserId(req);
    const client = await pool.connect();
    try {
      const todayDate = new Date()
        .toLocaleString("en-CA", { timeZone: "Asia/Kolkata" })
        .slice(0, 10);

      const datePart = todayDate.replace(/-/g, "");
      const q = `SELECT next_no FROM user_invoice_counter WHERE user_id=$1 AND date_key=$2`;
      const r = await client.query(q, [userId, todayDate]);
      const nextNo = r.rowCount ? r.rows[0].next_no : 1;

      res.json({
        success: true,
        invoice_no: `INV-${datePart}-${userId}-${padSerial(nextNo)}`,
        date: new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
      });
    } catch (err) {
      res.status(500).json({ success: false });
    } finally {
      client.release();
    }
  },
);

/* ---------------------- POST: SAVE INVOICE (FINAL LOGIC) ---------------------- */
router.post(
  "/invoices",
  authMiddleware,
  requirePermission("sale_invoice"),
  async (req, res) => {
    const userId = getUserId(req);
    const {
      customer_name,
      contact,
      address,
      gst_no,
      items,
      payment_mode,
      amount_paid,
    } = req.body;

    if (!Array.isArray(items) || !items.length) {
      return res.status(400).json({ success: false, message: "No items" });
    }

    const client = await pool.connect();
    let lastRetryableError = null;
    try {
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          await client.query("BEGIN");

          const { invoiceNo } = await generateInvoiceNoWithClient(
            client,
            userId,
          );
          const customerName = normalizeDisplayText(customer_name) || null;
          const customerContact = normalizeMobileNumber(contact);
          const customerAddress = String(address || "").trim() || null;
          const trimmedGstNo = String(gst_no || "").trim() || null;

          /* ---- calculate ---- */
          let subtotal = 0;
          const computed = items.map((item, index) => {
            const description = normalizeDisplayText(item.description);
            const q = parseNonZeroNumber(item.quantity);
            const r = parsePositiveNumber(item.rate);

            if (!description || q === null || r === null) {
              throw new Error(`Invalid invoice item at line ${index + 1}`);
            }

            const a = +(q * r).toFixed(2);
            subtotal += a;
            return {
              description,
              lookupKey: normalizeLookupText(description),
              quantity: q,
              rate: r,
              amount: a,
            };
          });
          subtotal = +subtotal.toFixed(2);

          const groupedStockNeed = new Map();
          computed.forEach((line) => {
            const existing = groupedStockNeed.get(line.lookupKey) || {
              description: line.description,
              quantity: 0,
            };
            existing.quantity += line.quantity;
            groupedStockNeed.set(line.lookupKey, existing);
          });

          const lockedStockByKey = new Map();
          for (const lookupKey of Array.from(groupedStockNeed.keys()).sort()) {
            const requirement = groupedStockNeed.get(lookupKey);
            const itemRows = await client.query(
              `
              SELECT id, name, quantity, buying_rate
              FROM items
              WHERE user_id = $1 AND LOWER(TRIM(name)) = $2
              ORDER BY id ASC
              FOR UPDATE
            `,
              [userId, lookupKey],
            );

            if (!itemRows.rowCount) {
              throw new Error(`Item not found: ${requirement.description}`);
            }

            const stockRows = itemRows.rows.map((row) => ({
              id: row.id,
              name: row.name,
              available: Number(row.quantity || 0),
              costPrice: Number(row.buying_rate || 0),
            }));
            const totalAvailable = stockRows.reduce(
              (sum, row) => sum + row.available,
              0,
            );

            if (
              requirement.quantity > 0 &&
              totalAvailable < requirement.quantity
            ) {
              throw new Error(
                `Stock not sufficient for ${requirement.description}. Available: ${totalAvailable}`,
              );
            }

            lockedStockByKey.set(lookupKey, stockRows);
          }

          const gstR = await client.query(
            `SELECT gst_rate FROM settings WHERE user_id=$1`,
            [userId],
          );
          const gstRate = Number(gstR.rows[0]?.gst_rate || 18);
          const gst_amount = +((subtotal * gstRate) / 100).toFixed(2);
          const total_amount = +(subtotal + gst_amount).toFixed(2);
          computed.forEach((item) => {
            item.gstAmount = calculateSaleGstAmount(item.amount, gstRate);
          });
          const payment = buildInvoicePaymentSnapshot(
            total_amount,
            amount_paid,
            payment_mode,
          );

          if (payment.amountDue > 0 && !/^\d{10}$/.test(customerContact)) {
            throw new Error(
              "A valid 10-digit contact number is required for partial or due invoices.",
            );
          }

          /* ---- invoice ---- */
          const inv = await client.query(
            `
              INSERT INTO invoices
              (
                invoice_no,
                user_id,
                gst_no,
                customer_name,
                contact,
                address,
                subtotal,
                gst_amount,
                total_amount,
                payment_mode,
                payment_status,
                amount_paid,
                amount_due,
                date
              )
              VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
              RETURNING id
            `,
            [
              invoiceNo,
              userId,
              trimmedGstNo,
              customerName,
              customerContact || null,
              customerAddress,
              subtotal,
              gst_amount,
              total_amount,
              payment.paymentMode,
              payment.paymentStatus,
              payment.amountPaid,
              payment.amountDue,
              new Date(),
            ],
          );

          const invoiceId = inv.rows[0].id;

          /* ---- invoice_items + stock + sales ---- */
          const stockAdjustments = new Map();
          for (const it of computed) {
            await client.query(
              `
                  INSERT INTO invoice_items
                  (invoice_id,description,quantity,rate,amount)
                  VALUES ($1,$2,$3,$4,$5)
            `,
              [invoiceId, it.description, it.quantity, it.rate, it.amount],
            );

            const stockRows = lockedStockByKey.get(it.lookupKey) || [];

            if (it.quantity < 0) {
              const targetStockRow = stockRows[0];
              const returnedQty = Math.abs(it.quantity);

              if (!targetStockRow) {
                throw new Error(
                  `Stock allocation failed for ${it.description}`,
                );
              }

              targetStockRow.available += returnedQty;
              stockAdjustments.set(
                targetStockRow.id,
                (stockAdjustments.get(targetStockRow.id) || 0) - returnedQty,
              );

              const saleBaseAmount = +(-returnedQty * it.rate).toFixed(2);

              await client.query(
                `
                    INSERT INTO sales
                    (user_id, item_id, quantity, cost_price, selling_price, total_price, gst_amount)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                    `,
                [
                  userId,
                  targetStockRow.id,
                  -returnedQty,
                  targetStockRow.costPrice,
                  it.rate,
                  saleBaseAmount,
                  it.gstAmount,
                ],
              );

              continue;
            }

            let remainingQty = it.quantity;
            let allocatedGstAmount = 0;

            for (const stockRow of stockRows) {
              if (remainingQty <= 0) {
                break;
              }

              if (stockRow.available <= 0) {
                continue;
              }

              const consumedQty = Math.min(remainingQty, stockRow.available);
              stockRow.available -= consumedQty;
              remainingQty -= consumedQty;
              const saleBaseAmount = +(consumedQty * it.rate).toFixed(2);
              const isLastSplit = remainingQty <= 0;
              const saleGstAmount = isLastSplit
                ? Number((it.gstAmount - allocatedGstAmount).toFixed(2))
                : calculateSaleGstAmount(saleBaseAmount, gstRate);
              allocatedGstAmount = Number(
                (allocatedGstAmount + saleGstAmount).toFixed(2),
              );

              stockAdjustments.set(
                stockRow.id,
                (stockAdjustments.get(stockRow.id) || 0) + consumedQty,
              );

              await client.query(
                `
                    INSERT INTO sales
                    (user_id, item_id, quantity, cost_price, selling_price, total_price, gst_amount)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                    `,
                [
                  userId,
                  stockRow.id,
                  consumedQty,
                  stockRow.costPrice,
                  it.rate,
                  saleBaseAmount,
                  saleGstAmount,
                ],
              );
            }

            if (remainingQty > 0) {
              throw new Error(`Stock allocation failed for ${it.description}`);
            }
          }

          for (const [itemId, deductedQty] of stockAdjustments.entries()) {
            await client.query(
              `
              UPDATE items
              SET quantity = quantity - $1, updated_at = NOW()
              WHERE id = $2 AND user_id = $3
            `,
              [deductedQty, itemId, userId],
            );
          }

          if (payment.amountDue > 0) {
            await client.query(
              `
              INSERT INTO debts (
                user_id,
                invoice_id,
                customer_name,
                customer_number,
                total,
                credit,
                remark
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7)
            `,
              [
                userId,
                invoiceId,
                customerName || `Customer ${customerContact}`,
                customerContact,
                total_amount,
                payment.amountPaid,
                `Invoice ${invoiceNo} | ${payment.paymentStatus} via ${payment.paymentMode}`,
              ],
            );
          }

          await client.query("COMMIT");
          invalidateUserCache(userId);
          return res.json({
            success: true,
            invoice_no: invoiceNo,
            date: new Date().toISOString(),
            payment_status: payment.paymentStatus,
            amount_due: payment.amountDue,
          });
        } catch (err) {
          await client.query("ROLLBACK");

          if (isRetryableInvoiceWriteError(err) && attempt < 3) {
            lastRetryableError = err;
            continue;
          }

          if (
            err.message.includes("Stock not sufficient") ||
            err.message.includes("Item not found") ||
            err.message.includes("Invalid invoice item") ||
            err.message.includes("Stock allocation failed") ||
            err.message.includes("contact number is required")
          ) {
            return res
              .status(400)
              .json({ success: false, message: err.message });
          }

          if (isRetryableInvoiceWriteError(err)) {
            return res.status(409).json({
              success: false,
              message:
                "Could not reserve a unique invoice number. Please try again.",
            });
          }

          return res
            .status(500)
            .json({ success: false, message: "Server error" });
        }
      }

      if (lastRetryableError) {
        return res.status(409).json({
          success: false,
          message:
            "Could not reserve a unique invoice number. Please try again.",
        });
      }
    } finally {
      client.release();
    }
  },
);

//---------- invoice search dropdown -----------//
router.get(
  "/invoices/suggestions",
  authMiddleware,
  requirePermission("sale_invoice"),
  cacheJsonResponse({ namespace: "invoices:suggestions", ttlMs: 15 * 1000 }),
  async (req, res) => {
    try {
      const userId = getUserId(req);
      const rawQuery = String(req.query.q || "")
        .trim()
        .toLowerCase();
      const limit = Math.min(
        Math.max(Number.parseInt(req.query.limit, 10) || 10, 1),
        20,
      );
      const params = [userId];
      const filters = [];

      if (rawQuery) {
        params.push(`%${rawQuery}%`);
        const textFilterIndex = params.length;

        filters.push(`LOWER(i.invoice_no) LIKE $${textFilterIndex}`);
        filters.push(
          `LOWER(COALESCE(i.customer_name, '')) LIKE $${textFilterIndex}`,
        );
        filters.push(`LOWER(COALESCE(i.contact, '')) LIKE $${textFilterIndex}`);

        const numericQuery = rawQuery.replace(/\D/g, "");
        if (numericQuery) {
          params.push(`%${numericQuery}%`);
          const numericFilterIndex = params.length;
          filters.push(
            `TO_CHAR(i.date AT TIME ZONE 'Asia/Kolkata', 'YYYYMMDD') LIKE $${numericFilterIndex}`,
          );
        }
      }

      const whereClause = filters.length ? `AND (${filters.join(" OR ")})` : "";
      const { rows } = await pool.query(
        `
          SELECT
            i.invoice_no,
            COALESCE(i.customer_name, '') AS customer_name,
            COALESCE(i.contact, '') AS contact,
            i.date
          FROM invoices i
          WHERE i.user_id = $1
          ${whereClause}
          ORDER BY i.date DESC, i.id DESC
          LIMIT ${limit}
        `,
        params,
      );

      res.json({
        success: true,
        suggestions: rows,
      });
    } catch (error) {
      console.error("Invoice suggestions fetch error:", error);
      res.status(500).json({
        success: false,
        message: "Could not load invoice suggestions.",
      });
    }
  },
);

router.get(
  "/invoices/numbers",
  authMiddleware,
  requirePermission("sale_invoice"),
  cacheJsonResponse({ namespace: "invoices:numbers", ttlMs: 15 * 1000 }),
  async (req, res) => {
    const userId = getUserId(req);
    const { rows } = await pool.query(
      `SELECT invoice_no
         FROM invoices
         WHERE user_id = $1
         ORDER BY date DESC
         LIMIT 50`,
      [userId],
    );

    res.json(rows.map((r) => r.invoice_no));
  },
);

router.get(
  "/invoices/customers",
  authMiddleware,
  requirePermission("sale_invoice"),
  cacheJsonResponse({ namespace: "invoices:customers", ttlMs: 15 * 1000 }),
  async (req, res) => {
    try {
      const userId = getUserId(req);
      const rawQuery = String(req.query.q || "").trim();
      const normalizedQuery = normalizeLookupText(rawQuery);
      const numericQuery = normalizeMobileNumber(rawQuery);
      const limit = Math.min(
        Math.max(Number.parseInt(req.query.limit, 10) || 12, 1),
        20,
      );

      if (!rawQuery) {
        return res.json({ success: true, customers: [] });
      }

      const params = [userId, `%${normalizedQuery}%`];
      const filters = ["LOWER(TRIM(COALESCE(i.customer_name, ''))) LIKE $2"];

      if (numericQuery) {
        params.push(`%${numericQuery}%`);
        filters.push(`COALESCE(i.contact, '') LIKE $3`);
      }

      const { rows } = await pool.query(
        `
          SELECT DISTINCT ON (
            LOWER(TRIM(COALESCE(i.customer_name, ''))),
            COALESCE(i.contact, '')
          )
            COALESCE(i.customer_name, '') AS customer_name,
            COALESCE(i.contact, '') AS contact,
            COALESCE(i.address, '') AS address,
            i.date AS last_invoice_date
          FROM invoices i
          WHERE i.user_id = $1
            AND COALESCE(i.customer_name, '') <> ''
            AND (${filters.join(" OR ")})
          ORDER BY
            LOWER(TRIM(COALESCE(i.customer_name, ''))),
            COALESCE(i.contact, ''),
            i.date DESC,
            i.id DESC
          LIMIT ${limit}
        `,
        params,
      );

      res.json({
        success: true,
        customers: rows,
      });
    } catch (error) {
      console.error("Invoice customer suggestions fetch error:", error);
      res.status(500).json({
        success: false,
        message: "Could not load customer suggestions.",
      });
    }
  },
);

/* ---------------------- GET: All Invoices List ---------------------- */
router.get(
  "/invoices",
  authMiddleware,
  requirePermission("sale_invoice"),
  cacheJsonResponse({ namespace: "invoices:list", ttlMs: 10 * 1000 }),
  async (req, res) => {
    try {
      const rawQuery = String(req.query.q || "")
        .trim()
        .toLowerCase();
      const pagination = parsePagination(req.query, 100, 200);
      const params = [getUserId(req)];
      const filters = [];

      if (rawQuery) {
        params.push(`%${rawQuery}%`);
        const textFilterIndex = params.length;

        filters.push(`LOWER(i.invoice_no) LIKE $${textFilterIndex}`);
        filters.push(
          `LOWER(COALESCE(i.customer_name, '')) LIKE $${textFilterIndex}`,
        );
        filters.push(`LOWER(COALESCE(i.contact, '')) LIKE $${textFilterIndex}`);

        const numericQuery = rawQuery.replace(/\D/g, "");
        if (numericQuery) {
          params.push(`%${numericQuery}%`);
          const dateFilterIndex = params.length;
          filters.push(
            `TO_CHAR(i.date AT TIME ZONE 'Asia/Kolkata', 'YYYYMMDD') LIKE $${dateFilterIndex}`,
          );
        }
      }

      const whereClause = filters.length ? `AND (${filters.join(" OR ")})` : "";
      const countResult = await pool.query(
        `
          SELECT COUNT(DISTINCT i.id)::int AS total
          FROM invoices i
          WHERE i.user_id = $1
          ${whereClause}
        `,
        params,
      );

      const { rows } = await pool.query(
        `
            SELECT
                i.date,
                i.invoice_no,
                i.customer_name,
                i.contact,
                i.payment_mode,
                i.payment_status,
                i.amount_paid,
                i.amount_due,
                i.total_amount,
                COUNT(ii.id)::int AS item_count
            FROM invoices i
            LEFT JOIN invoice_items ii ON ii.invoice_id = i.id
            WHERE i.user_id = $1
            ${whereClause}
            GROUP BY i.id
            ORDER BY i.date DESC, i.id DESC
            LIMIT ${pagination.limit}
            OFFSET ${pagination.offset}
            `,
        params,
      );

      res.json({
        success: true,
        invoices: rows,
        pagination: {
          total: Number(countResult.rows[0]?.total) || 0,
          limit: pagination.limit,
          offset: pagination.offset,
          page: pagination.page,
          has_more:
            pagination.offset + rows.length <
            (Number(countResult.rows[0]?.total) || 0),
        },
      });
    } catch (err) {
      console.error("All invoices fetch error:", err);
      res.status(500).json({ success: false });
    }
  },
);

/* ---------------------- GET: Invoice Details ---------------------- */
router.get(
  "/invoices/:invoiceNo",
  authMiddleware,
  requirePermission("sale_invoice"),
  cacheJsonResponse({ namespace: "invoices:detail", ttlMs: 10 * 1000 }),
  async (req, res) => {
    const userId = getUserId(req);
    const { rows } = await pool.query(
      `
      SELECT i.*, COALESCE(json_agg(ii.*)
      FILTER (WHERE ii.id IS NOT NULL),'[]') AS items
      FROM invoices i
      LEFT JOIN invoice_items ii ON ii.invoice_id=i.id
      WHERE i.user_id=$2 AND i.invoice_no=$1
      GROUP BY i.id
    `,
      [req.params.invoiceNo, userId],
    );

    if (!rows[0]) return res.status(404).json({ success: false });

    const invoice = rows[0];
    const settlements = await pool.query(
      `
      SELECT id, total, credit, remark, created_at
      FROM debts
      WHERE user_id = $1 AND invoice_id = $2
      ORDER BY created_at ASC, id ASC
    `,
      [userId, invoice.id],
    );

    invoice.collections = settlements.rows;
    res.json({ success: true, invoice });
  },
);

router.post(
  "/invoices/:invoiceNo/payment",
  authMiddleware,
  requirePermission("sale_invoice"),
  async (req, res) => {
    const userId = getUserId(req);
    const invoiceNo = String(req.params.invoiceNo || "").trim();
    const paymentMode = normalizeInvoicePaymentMode(req.body?.payment_mode);
    const paymentRemark = normalizeDisplayText(req.body?.remark);
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const invoiceResult = await client.query(
        `
          SELECT
            id,
            invoice_no,
            customer_name,
            contact,
            payment_mode,
            payment_status,
            amount_paid,
            amount_due,
            total_amount
          FROM invoices
          WHERE user_id = $1 AND invoice_no = $2
          FOR UPDATE
        `,
        [userId, invoiceNo],
      );

      if (!invoiceResult.rowCount) {
        await client.query("ROLLBACK");
        return res
          .status(404)
          .json({ success: false, message: "Invoice not found." });
      }

      const invoice = invoiceResult.rows[0];
      const customerContact = normalizeMobileNumber(invoice.contact);

      if (!/^\d{10}$/.test(customerContact)) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message:
            "This invoice does not have a valid 10-digit customer number for due settlement.",
        });
      }

      await lockScopedResource(
        client,
        userId,
        "customer-debt",
        customerContact,
      );

      let paymentSnapshot;
      try {
        paymentSnapshot = buildInvoiceSettlementSnapshot(
          invoice,
          req.body?.amount,
          paymentMode,
        );
      } catch (error) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: error.message || "Invalid payment request.",
        });
      }

      await client.query(
        `
          UPDATE invoices
          SET payment_mode = $1,
              payment_status = $2,
              amount_paid = $3,
              amount_due = $4,
              updated_at = NOW()
          WHERE id = $5
        `,
        [
          paymentSnapshot.paymentMode,
          paymentSnapshot.paymentStatus,
          paymentSnapshot.amountPaid,
          paymentSnapshot.amountDue,
          invoice.id,
        ],
      );

      await client.query(
        `
          INSERT INTO debts (
            user_id,
            invoice_id,
            customer_name,
            customer_number,
            total,
            credit,
            remark
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `,
        [
          userId,
          invoice.id,
          normalizeDisplayText(invoice.customer_name) ||
            `Customer ${customerContact}`,
          customerContact,
          0,
          paymentSnapshot.amountReceived,
          paymentRemark
            ? `Invoice ${invoice.invoice_no} payment received via ${paymentMode} | ${paymentRemark}`
            : `Invoice ${invoice.invoice_no} payment received via ${paymentMode}`,
        ],
      );

      await client.query("COMMIT");
      invalidateUserCache(userId);

      return res.json({
        success: true,
        message:
          paymentSnapshot.paymentStatus === "paid"
            ? "Invoice payment received and marked as paid."
            : "Invoice payment received and due updated.",
        invoice: {
          invoice_no: invoice.invoice_no,
          payment_mode: paymentSnapshot.paymentMode,
          payment_status: paymentSnapshot.paymentStatus,
          amount_paid: paymentSnapshot.amountPaid,
          amount_due: paymentSnapshot.amountDue,
          amount_received: paymentSnapshot.amountReceived,
        },
      });
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {}

      console.error("Invoice settlement failed:", error);
      return res.status(500).json({
        success: false,
        message: "Could not receive payment for this invoice right now.",
      });
    } finally {
      client.release();
    }
  },
);

//==================INVOICE PAGE FORMATING =========================
router.get(
  "/invoices/:invoiceNo/pdf",

  // Cookie-based auth only; first-party frontend downloads PDFs with credentials.
  authMiddleware,
  requirePermission("sale_invoice"),

  async (req, res) => {
    const userId = getUserId(req);
    const invoiceNo = req.params.invoiceNo.replace(/['"%]+/g, "").trim();

    try {
      const q = `
          SELECT i.id, i.invoice_no, i.customer_name, i.contact, i.address, i.gst_no,
                 i.date, i.subtotal, i.gst_amount, i.total_amount,
                 i.payment_mode, i.payment_status, i.amount_paid, i.amount_due,
                 COALESCE(json_agg(json_build_object(
                   'description', ii.description,
                   'quantity', ii.quantity,
                   'rate', ii.rate,
                   'amount', ii.amount
                 ) ORDER BY ii.id) FILTER (WHERE ii.id IS NOT NULL), '[]') AS items
          FROM invoices i
          LEFT JOIN invoice_items ii ON ii.invoice_id = i.id
          WHERE i.user_id = $2 AND TRIM(i.invoice_no) = TRIM($1)
          GROUP BY i.id
          LIMIT 1;
        `;
      const { rows } = await pool.query(q, [invoiceNo, userId]);
      if (!rows[0])
        return res
          .status(404)
          .json({ success: false, message: "Invoice not found" });

      const inv = rows[0];

      const shopRes = await pool.query(
        `SELECT shop_name, shop_address, gst_no FROM settings WHERE user_id=$1`,
        [userId],
      );
      const shop = shopRes.rows[0] || {};
      const settlementRes = await pool.query(
        `SELECT total, credit, created_at
         FROM debts
         WHERE user_id = $1 AND invoice_id = $2
         ORDER BY created_at ASC, id ASC`,
        [userId, inv.id],
      );
      const settlements = settlementRes.rows;

      const doc = new PDFDocument({
        size: "A4",
        margin: 40,
        bufferPages: true,
      });

      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${inv.invoice_no}.pdf"`,
      );
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Cache-Control",
        "private, no-store, no-cache, must-revalidate, max-age=0",
      );
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.setHeader("Surrogate-Control", "no-store");

      doc.pipe(res);

      /* ================= PAGE HELPERS ================= */
      const pageHeight = doc.page.height;
      const leftX = 40;
      const contentWidth = 515;
      const colors = {
        ink: "#111111",
        muted: "#475569",
        line: "#1f2937",
        soft: "#e5e7eb",
      };

      const formatPdfMoney = (value) => Number(value || 0).toFixed(2);
      const formatPdfDateTime = (value) =>
        new Date(value).toLocaleString("en-IN", {
          timeZone: "Asia/Kolkata",
        });
      const formatInvoiceStatus = (value) => {
        const normalized = String(value || "paid")
          .trim()
          .toLowerCase();
        return normalized.charAt(0).toUpperCase() + normalized.slice(1);
      };
      const formatInvoiceMode = (value) => {
        const normalized = String(value || "cash")
          .trim()
          .toLowerCase();
        if (normalized === "upi") {
          return "UPI";
        }
        return normalized.charAt(0).toUpperCase() + normalized.slice(1);
      };
      const invoiceStatusText = formatInvoiceStatus(inv.payment_status);
      const invoiceModeText = formatInvoiceMode(inv.payment_mode);
      const paymentRows = settlements.filter(
        (row) => Number(row.credit || 0) > 0,
      );
      const openingEntry = settlements.find(
        (row) => Number(row.total || 0) > 0,
      );
      const openingPaid = Number(openingEntry?.credit || 0);
      const laterPaid = paymentRows.reduce((sum, row) => {
        if (Number(row.total || 0) > 0) {
          return sum;
        }
        return sum + (Number(row.credit || 0) || 0);
      }, 0);
      const transactionCount = paymentRows.length;
      const lastPayment = paymentRows[paymentRows.length - 1];

      function drawHeader() {
        doc.save();
        doc.rect(40, 30, 520, 70).fill("#eef2f6");
        doc.restore();

        doc.fillColor(colors.ink);
        doc
          .font("Helvetica-Bold")
          .fontSize(18)
          .text(shop.shop_name || "India Inventory Management", 50, 45, {
            width: 320,
          });
        doc
          .font("Helvetica")
          .fontSize(9)
          .text(shop.shop_address || "", 50, 68, { width: 320 })
          .text(`GSTIN: ${shop.gst_no || inv.gst_no || "N/A"}`, 50, 82, {
            width: 240,
          });

        doc.font("Helvetica-Bold").fontSize(16).text("INVOICE", 420, 56, {
          width: 110,
          align: "center",
        });
      }

      function drawInvoiceInfo(startY) {
        const leftWidth = 236;
        const rightX = 300;
        const rightWidth = 240;
        const labelWidth = 56;
        const rowGap = 5;

        const drawInfoRows = (rows, x, y, totalWidth) => {
          let cursorY = y;
          rows.forEach(([label, value], index) => {
            const safeValue = String(value || "-");
            const valueWidth = totalWidth - labelWidth - 8;
            const valueHeight = doc.heightOfString(safeValue, {
              width: valueWidth,
              align: "left",
            });
            const rowHeight = Math.max(12, valueHeight) + 2;

            doc
              .font("Helvetica-Bold")
              .fontSize(8.8)
              .fillColor(colors.ink)
              .text(`${label}:`, x, cursorY, {
                width: labelWidth,
              });
            doc
              .font("Helvetica")
              .fontSize(9.4)
              .fillColor(colors.ink)
              .text(safeValue, x + labelWidth + 8, cursorY, {
                width: valueWidth,
              });

            cursorY += rowHeight + rowGap;

            if (index < rows.length - 1) {
              doc
                .moveTo(x, cursorY - 2)
                .lineTo(x + totalWidth, cursorY - 2)
                .strokeColor("#d7dee8")
                .lineWidth(0.6)
                .stroke();
            }
          });

          return cursorY;
        };

        doc
          .moveTo(leftX, startY - 4)
          .lineTo(leftX + contentWidth, startY - 4)
          .strokeColor(colors.soft)
          .lineWidth(0.8)
          .stroke();

        const leftRows = [
          ["Invoice No", inv.invoice_no || "-"],
          ["Date", formatPdfDateTime(inv.date)],
        ];
        const rightRows = [
          ["Customer", inv.customer_name || "-"],
          ["Contact", inv.contact || "-"],
          ["Address", inv.address || "-"],
          ["Payment", `${invoiceStatusText} via ${invoiceModeText}`],
        ];

        const leftY = drawInfoRows(leftRows, leftX, startY, leftWidth);
        const rightY = drawInfoRows(rightRows, rightX, startY, rightWidth);
        const blockBottom = Math.max(leftY, rightY);

        doc
          .moveTo(leftX, blockBottom - 2)
          .lineTo(leftX + contentWidth, blockBottom - 2)
          .strokeColor(colors.soft)
          .lineWidth(0.8)
          .stroke();

        return blockBottom + 10;
      }

      function drawTableHeader(startY) {
        doc
          .moveTo(leftX, startY)
          .lineTo(leftX + contentWidth, startY)
          .strokeColor(colors.line)
          .stroke();
        const labelY = startY + 8;
        doc.font("Helvetica-Bold").fontSize(9).fillColor(colors.ink);
        doc.text("Item", leftX, labelY, { width: 250 });
        doc.text("Qty", 290, labelY, { width: 40, align: "right" });
        doc.text("Rate", 372, labelY, { width: 60, align: "right" });
        doc.text("Amount", 462, labelY, { width: 78, align: "right" });
        doc
          .moveTo(leftX, startY + 24)
          .lineTo(leftX + contentWidth, startY + 24)
          .strokeColor(colors.line)
          .stroke();

        return startY + 30;
      }

      function ensureTableSpace(currentY, neededHeight) {
        if (currentY + neededHeight <= pageHeight - 120) {
          return currentY;
        }

        doc.addPage();
        drawHeader();
        return drawTableHeader(drawInvoiceInfo(130));
      }

      drawHeader();
      let y = drawTableHeader(drawInvoiceInfo(130));

      /* ================= TABLE ROWS ================= */
      (Array.isArray(inv.items) ? inv.items : []).forEach((item) => {
        const itemName = String(item.description || "-");
        const rowHeight =
          Math.max(
            16,
            doc.heightOfString(itemName, {
              width: 240,
            }),
          ) + 2;

        y = ensureTableSpace(y, rowHeight + 10);

        doc.font("Helvetica").fontSize(9.8).fillColor(colors.ink);
        doc.text(itemName, leftX, y, { width: 240 });
        doc.text(String(item.quantity ?? "-"), 290, y, {
          width: 40,
          align: "right",
        });
        doc.text(formatPdfMoney(item.rate), 372, y, {
          width: 60,
          align: "right",
        });
        doc.text(formatPdfMoney(item.amount), 462, y, {
          width: 78,
          align: "right",
        });

        y += rowHeight + 8;
      });

      /* ================= TOTALS / PAYMENT DETAILS ================= */
      const summaryHeight = 112;
      y = ensureTableSpace(y + 10, summaryHeight + 12);

      const paymentBlockX = 276;
      const amountBlockX = 416;
      const blockTitleY = y;
      const dividerX = 402;
      const paymentLabelWidth = 68;
      const paymentValueWidth = 64;
      const amountLabelWidth = 50;
      const amountValueWidth = 84;

      doc
        .moveTo(paymentBlockX, y - 2)
        .lineTo(leftX + contentWidth, y - 2)
        .strokeColor("#d7dee8")
        .lineWidth(0.8)
        .stroke();

      doc
        .moveTo(dividerX, y + 2)
        .lineTo(dividerX, y + summaryHeight - 8)
        .strokeColor("#e2e8f0")
        .lineWidth(0.7)
        .stroke();

      doc.font("Helvetica-Bold").fontSize(9.5).fillColor(colors.ink);
      doc.text("Payment Details", paymentBlockX, blockTitleY, { width: 118 });
      doc.text("Amount Summary", amountBlockX, blockTitleY, {
        width: 134,
        align: "right",
      });

      doc
        .moveTo(paymentBlockX, blockTitleY + 13)
        .lineTo(paymentBlockX + 118, blockTitleY + 13)
        .strokeColor("#c7d2e1")
        .lineWidth(0.7)
        .stroke();
      doc
        .moveTo(amountBlockX, blockTitleY + 13)
        .lineTo(amountBlockX + 134, blockTitleY + 13)
        .strokeColor("#c7d2e1")
        .lineWidth(0.7)
        .stroke();

      const paymentSummaryRows = [
        ["Status", invoiceStatusText],
        ["Mode", invoiceModeText],
        ["Opening", formatPdfMoney(openingPaid)],
        ["Later Paid", formatPdfMoney(laterPaid)],
        ["Txn Count", String(transactionCount)],
      ];

      const amountSummaryRows = [
        ["Subtotal", formatPdfMoney(inv.subtotal)],
        ["GST", formatPdfMoney(inv.gst_amount)],
        ["Paid", formatPdfMoney(inv.amount_paid || 0)],
        ["Due", formatPdfMoney(inv.amount_due || 0)],
      ];

      let paymentY = y + 22;
      paymentSummaryRows.forEach(([label, value]) => {
        doc.font("Helvetica").fontSize(9.5).fillColor(colors.muted);
        doc.text(label, paymentBlockX, paymentY, { width: paymentLabelWidth });
        doc.font("Helvetica-Bold").fontSize(9.6).fillColor(colors.ink);
        doc.text(value, paymentBlockX + paymentLabelWidth + 4, paymentY, {
          width: paymentValueWidth,
          align: "right",
        });
        paymentY += 15.5;
      });

      if (lastPayment) {
        const lastTxnText = `Last Txn: ${new Date(
          lastPayment.created_at,
        ).toLocaleDateString("en-IN", {
          timeZone: "Asia/Kolkata",
        })}`;
        doc.font("Helvetica").fontSize(8.3).fillColor(colors.muted);
        doc.text(lastTxnText, paymentBlockX, y + 95, { width: 126 });
      }

      let amountY = y + 22;
      amountSummaryRows.forEach(([label, value]) => {
        doc.font("Helvetica").fontSize(9.5).fillColor(colors.muted);
        doc.text(label, amountBlockX, amountY, { width: amountLabelWidth });
        doc.font("Helvetica-Bold").fontSize(9.6).fillColor(colors.ink);
        doc.text(value, amountBlockX + amountLabelWidth + 6, amountY, {
          width: amountValueWidth,
          align: "right",
        });
        amountY += 15.5;
      });

      doc
        .moveTo(amountBlockX, y + 83)
        .lineTo(amountBlockX + 140, y + 83)
        .strokeColor(colors.line)
        .lineWidth(0.8)
        .stroke();

      doc.font("Helvetica-Bold").fontSize(12.5).fillColor(colors.ink);
      doc.text("Total:", amountBlockX, y + 89, {
        width: amountLabelWidth + 10,
      });
      doc.text(formatPdfMoney(inv.total_amount), amountBlockX + 56, y + 89, {
        width: 90,
        align: "right",
      });

      /* ================= FOOTER AND PAGE NUMBER ================= */
      const range = doc.bufferedPageRange();
      const totalPages = range.count;

      for (let i = 0; i < totalPages; i++) {
        doc.switchToPage(i);

        doc.font("Helvetica").fontSize(9);

        doc.text(
          "This is a system generated invoice. No signature required.",
          40,
          pageHeight - 80,
          { width: 520, align: "center" },
        );

        doc.text(`Page- ${i + 1} / ${totalPages}`, 40, pageHeight - 60, {
          width: 520,
          align: "right",
        });
      }

      doc.end();
    } catch (err) {
      console.error("❌ PDF error:", err);
      res
        .status(500)
        .json({ success: false, message: "PDF generation failed" });
    }
  },
);

/* ---------------------- SHOP INFO save ---------------------- */
router.post("/shop-info", authMiddleware, requireOwner, async (req, res) => {
  try {
    const { shop_name, shop_address, gst_no, gst_rate } = req.body;
    const userId = getUserId(req);
    const normalizedGstRate = Number(gst_rate);

    if (
      !Number.isFinite(normalizedGstRate) ||
      normalizedGstRate < 0 ||
      normalizedGstRate > 100
    ) {
      return res.status(400).json({
        success: false,
        message: "GST rate must be between 0 and 100.",
      });
    }

    await pool.query(
      `
        INSERT INTO settings (user_id,shop_name,shop_address,gst_no,gst_rate)
        VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (user_id)
        DO UPDATE SET
          shop_name=EXCLUDED.shop_name,
          shop_address=EXCLUDED.shop_address,
          gst_no=EXCLUDED.gst_no,
          gst_rate=EXCLUDED.gst_rate
      `,
      [
        userId,
        String(shop_name || "").trim(),
        String(shop_address || "").trim(),
        String(gst_no || "").trim(),
        normalizedGstRate,
      ],
    );

    invalidateUserCache(userId);
    res.json({ success: true });
  } catch (error) {
    console.error("Shop info save error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to save shop info" });
  }
});

router.get(
  "/shop-info",
  authMiddleware,
  requirePermission("sale_invoice"),
  async (req, res) => {
    try {
      const userId = getUserId(req);
      const { rows } = await pool.query(
        `SELECT shop_name,shop_address,gst_no,gst_rate FROM settings WHERE user_id=$1`,
        [userId],
      );
      res.json({ success: true, settings: rows[0] || {} });
    } catch (error) {
      console.error("Shop info load error:", error);
      res
        .status(500)
        .json({ success: false, message: "Failed to load shop info" });
    }
  },
);

module.exports = router;
