// =========================================================
// FILE: routes/inventory.js
// MODULE: Inventory + Sales + Reports + Debts + Analytics
// =========================================================

const express = require("express");
const pool = require("../db");
const PDFDocument = require("pdfkit");
const ExcelJS = require("exceljs");
const { authMiddleware, getUserId } = require("../middleware/auth");

const router = express.Router();

// =========================================================
// ⚙️ CONFIGURATION
// =========================================================
const STOCK_CONFIG = {
  CRITICAL_DAYS: 4,
  WARNING_DAYS: 15,
};

// Protect all routes
router.use(authMiddleware);

// =========================================================
// 🧠 HELPER FUNCTIONS
// =========================================================

// ---------- ITEM REPORT QUERY ----------
function buildItemReportQuery(user_id, name) {
  let params = [user_id];
  let nameFilter = "";

  if (name && name.trim()) {
    params.push(name.trim());
    nameFilter = "AND LOWER(TRIM(i.name)) = LOWER($2)";
  }

  const query = `
    SELECT
      i.name AS item_name,
      i.quantity AS available_qty,
      i.buying_rate,
      i.selling_rate,
      COALESCE(SUM(s.quantity), 0) AS sold_qty
    FROM items i
    LEFT JOIN sales s
      ON s.item_id = i.id
      AND s.user_id = $1
    WHERE i.user_id = $1
    ${nameFilter}
    GROUP BY i.id, i.name, i.quantity, i.buying_rate, i.selling_rate
    ORDER BY i.name ASC
  `;

  return { query, params };
}

// ---------- SALES REPORT QUERY ----------
async function fetchSalesReport(user_id, from, to) {
  return pool.query(
    `SELECT
        s.created_at,
        i.name AS item_name,
        s.quantity,
        s.selling_price,
        s.total_price
     FROM sales s
     JOIN items i ON i.id = s.item_id
     WHERE s.user_id = $1
       AND (s.created_at AT TIME ZONE 'Asia/Kolkata')::date >= $2::date
       AND (s.created_at AT TIME ZONE 'Asia/Kolkata')::date <= $3::date
     ORDER BY s.created_at ASC`,
    [user_id, from, to],
  );
}

// ---------- STOCK PDF ----------
function generateStockPDF(res, rows) {
  const doc = new PDFDocument({ size: "A4", margin: 40 });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", "attachment; filename=item_report.pdf");

  doc.pipe(res);
  doc.fontSize(18).text("STOCK REPORT", { align: "center" });
  doc.moveDown();

  let totalCost = 0;
  let totalValue = 0;

  rows.forEach((r, i) => {
    const qty = Number(r.available_qty);
    const buy = Number(r.buying_rate);
    const sell = Number(r.selling_rate);

    totalCost += qty * buy;
    totalValue += qty * sell;

    doc.text(
      `${i + 1}. ${r.item_name} | Qty: ${qty} | Buy: ${buy} | Sell: ${sell} | Sold: ${r.sold_qty}`,
    );
  });

  doc.moveDown();
  doc.text(`Total Cost: Rs. ${totalCost.toFixed(2)}`);
  doc.text(`Total Value: Rs. ${totalValue.toFixed(2)}`);
  doc.text(`Estimated Profit: Rs. ${(totalValue - totalCost).toFixed(2)}`);

  doc.end();
}

// ---------- SALES PDF ----------
function generateSalesPDF(res, rows, from, to) {
  const doc = new PDFDocument({ size: "A4", margin: 40 });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename=sales_${from}_to_${to}.pdf`,
  );

  doc.pipe(res);

  doc.fontSize(16).text("Sales Report", { align: "center" });
  doc.moveDown();
  doc.text(`From: ${from}   To: ${to}`, { align: "center" });
  doc.moveDown();

  let grandTotal = 0;

  rows.forEach((r, i) => {
    const total = Number(r.total_price);
    grandTotal += total;

    doc.text(
      `${i + 1}. ${new Date(r.created_at).toLocaleDateString("en-IN")} | ${r.item_name} | Qty: ${r.quantity} | Rate: ${r.selling_price} | Total: ${total}`,
    );
  });

  doc.moveDown();
  doc.text(`Grand Total: Rs. ${grandTotal.toFixed(2)}`);
  doc.end();
}

// ---------- SALES EXCEL ----------
async function generateSalesExcel(res, rows, from, to) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Sales Report");

  sheet.columns = [
    { header: "Sl", key: "sl", width: 8 },
    { header: "Date", key: "date", width: 15 },
    { header: "Item", key: "item", width: 30 },
    { header: "Qty", key: "qty", width: 10 },
    { header: "Rate", key: "rate", width: 12 },
    { header: "Total", key: "total", width: 15 },
  ];

  let grandTotal = 0;

  rows.forEach((r, i) => {
    const total = Number(r.total_price);
    grandTotal += total;

    sheet.addRow({
      sl: i + 1,
      date: new Date(r.created_at).toLocaleDateString("en-IN"),
      item: r.item_name,
      qty: r.quantity,
      rate: r.selling_price,
      total: total,
    });
  });

  sheet.addRow({});
  sheet.addRow({ item: "Grand Total", total: grandTotal });

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  res.setHeader(
    "Content-Disposition",
    `attachment; filename=sales_${from}_to_${to}.xlsx`,
  );

  await workbook.xlsx.write(res);
  res.end();
}

// =========================================================
// 📦 INVENTORY ROUTES
// =========================================================

// Add / Update Item
router.post("/items", async (req, res) => {
  try {
    const user_id = getUserId(req);
    const { name, quantity, buying_rate, selling_rate } = req.body;

    if (
      !name ||
      quantity == null ||
      buying_rate == null ||
      selling_rate == null
    )
      return res.status(400).json({ error: "Missing fields" });

    const qty = parseFloat(quantity);
    const buyRate = parseFloat(buying_rate);
    const sellRate = parseFloat(selling_rate);

    const check = await pool.query(
      "SELECT * FROM items WHERE user_id=$1 AND LOWER(TRIM(name))=LOWER($2)",
      [user_id, name.trim()],
    );

    if (check.rows.length > 0) {
      const existing = check.rows[0];
      const newQty = parseFloat(existing.quantity) + qty;

      const updated = await pool.query(
        `UPDATE items
         SET quantity=$1, buying_rate=$2, selling_rate=$3, updated_at=NOW()
         WHERE id=$4 AND user_id=$5
         RETURNING *`,
        [newQty, buyRate, sellRate, existing.id, user_id],
      );

      return res.json({ message: "Stock updated", item: updated.rows[0] });
    }

    const inserted = await pool.query(
      `INSERT INTO items (user_id,name,quantity,buying_rate,selling_rate)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING *`,
      [user_id, name.trim(), qty, buyRate, sellRate],
    );

    res.json({ message: "New item added", item: inserted.rows[0] });
  } catch (err) {
    console.error("POST /items error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Item Names
router.get("/items/names", async (req, res) => {
  try {
    const user_id = getUserId(req);
    const result = await pool.query(
      "SELECT name FROM items WHERE user_id=$1 ORDER BY name ASC",
      [user_id],
    );
    res.json(result.rows.map((r) => r.name));
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Item Info
router.get("/items/info", async (req, res) => {
  try {
    const user_id = getUserId(req);
    const name = req.query.name;

    if (!name) return res.status(400).json({ error: "Missing item name" });

    const result = await pool.query(
      `SELECT id, name, quantity, selling_rate
       FROM items
       WHERE user_id=$1 AND LOWER(TRIM(name))=LOWER($2)`,
      [user_id, name.trim()],
    );

    if (!result.rows.length)
      return res.status(404).json({ error: "Item not found" });

    res.json(result.rows[0]);
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

// =========================================================
// 📊 ITEM REPORT (JSON)
// =========================================================
router.get("/items/report", async (req, res) => {
  try {
    const user_id = getUserId(req);
    const { name } = req.query;

    const { query, params } = buildItemReportQuery(user_id, name);
    const result = await pool.query(query, params);

    res.json(result.rows);
  } catch (err) {
    console.error("GET /items/report error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// =========================================================
// 📊 ITEM REPORT (PDF)
// =========================================================
router.get("/items/report/pdf", async (req, res) => {
  try {
    const user_id = getUserId(req);
    const { name } = req.query;

    const { query, params } = buildItemReportQuery(user_id, name);
    const result = await pool.query(query, params);

    generateStockPDF(res, result.rows);
  } catch (err) {
    console.error("GET /items/report/pdf error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// =========================================================
// ⚠️ LOW STOCK ALERT
// =========================================================
router.get("/items/low-stock", async (req, res) => {
  try {
    const user_id = getUserId(req);

    const result = await pool.query(
      `
      WITH sales_30 AS (
        SELECT item_id, SUM(quantity) AS sold_30_days
        FROM sales
        WHERE user_id = $1
          AND created_at >= NOW() - INTERVAL '30 days'
        GROUP BY item_id
      )
      SELECT 
        i.name AS item_name,
        i.quantity AS available_qty,
        COALESCE(s.sold_30_days, 0) AS sold_30_days,
        ROUND(
          CASE 
            WHEN COALESCE(s.sold_30_days, 0) = 0 THEN NULL
            ELSE (i.quantity / NULLIF((s.sold_30_days / 30.0),0))
          END
        , 2) AS days_left
      FROM items i
      LEFT JOIN sales_30 s ON s.item_id = i.id
      WHERE i.user_id = $1
      ORDER BY days_left ASC
      `,
      [user_id],
    );

    const rowsWithStatus = result.rows.map((r) => {
      let status = "OK";

      if (r.days_left <= STOCK_CONFIG.CRITICAL_DAYS) status = "LOW";
      else if (r.days_left <= STOCK_CONFIG.WARNING_DAYS) status = "MEDIUM";

      return { ...r, status };
    });

    res.json(rowsWithStatus);
  } catch (err) {
    console.error("Low stock error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// =========================================================
// 📈 SALES REPORT (JSON)
// =========================================================
router.get("/sales/report", async (req, res) => {
  try {
    const user_id = getUserId(req);
    const { from, to } = req.query;

    if (!from || !to)
      return res.status(400).json({ error: "Missing date range" });

    const result = await fetchSalesReport(user_id, from, to);
    res.json(result.rows);
  } catch (err) {
    console.error("Sales JSON error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// =========================================================
// 📈 SALES REPORT (PDF)
// =========================================================
router.get("/sales/report/pdf", async (req, res) => {
  try {
    const user_id = getUserId(req);
    const { from, to } = req.query;

    if (!from || !to)
      return res.status(400).json({ error: "Missing date range" });

    const result = await fetchSalesReport(user_id, from, to);
    generateSalesPDF(res, result.rows, from, to);
  } catch (err) {
    console.error("Sales PDF error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// =========================================================
// 📈 SALES REPORT (EXCEL)
// =========================================================
router.get("/sales/report/excel", async (req, res) => {
  try {
    const user_id = getUserId(req);
    const { from, to } = req.query;

    if (!from || !to)
      return res.status(400).json({ error: "Missing date range" });

    const result = await fetchSalesReport(user_id, from, to);
    await generateSalesExcel(res, result.rows, from, to);
  } catch (err) {
    console.error("Sales Excel error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// =========================================================
// 💳 CUSTOMER DEBTS
// =========================================================

// Add debt
router.post("/debts", async (req, res) => {
  try {
    const user_id = getUserId(req);
    const { customer_name, customer_number, total = 0, credit = 0 } = req.body;

    if (!customer_name || !/^\d{10}$/.test(customer_number))
      return res
        .status(400)
        .json({ error: "Valid name & 10-digit number required" });

    const result = await pool.query(
      `INSERT INTO debts (user_id, customer_name, customer_number, total, credit)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [user_id, customer_name, customer_number, total, credit],
    );

    res.json({ message: "Debt added", debt: result.rows[0] });
  } catch (err) {
    console.error("POST /debts error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Customer autosuggest
router.get("/debts/customers", async (req, res) => {
  try {
    const user_id = getUserId(req);
    const { q } = req.query;

    let query = `
      SELECT DISTINCT customer_name, customer_number
      FROM debts
      WHERE user_id = $1
    `;
    let params = [user_id];

    if (q && q.trim()) {
      query += ` AND (customer_name ILIKE $2 OR customer_number ILIKE $2)`;
      params.push(`%${q.trim()}%`);
    }

    query += ` ORDER BY customer_name ASC LIMIT 20`;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Full ledger
router.get("/debts/:number", async (req, res) => {
  try {
    const user_id = getUserId(req);
    const number = req.params.number;

    if (!/^\d{10}$/.test(number))
      return res.status(400).json({ error: "Invalid number" });

    const result = await pool.query(
      `SELECT * FROM debts
       WHERE user_id=$1 AND customer_number=$2
       ORDER BY created_at ASC`,
      [user_id, number],
    );

    res.json(result.rows);
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

// Debt summary
router.get("/debts", async (req, res) => {
  try {
    const user_id = getUserId(req);

    const result = await pool.query(
      `SELECT customer_name, customer_number,
              SUM(total) AS total,
              SUM(credit) AS credit,
              SUM(total - credit) AS balance
       FROM debts
       WHERE user_id=$1
       GROUP BY customer_name, customer_number
       ORDER BY customer_name ASC`,
      [user_id],
    );

    res.json(result.rows);
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

// =========================================================
// 📊 ANALYTICS
// =========================================================

// Monthly Trend
router.get("/sales/monthly-trend", async (req, res) => {
  try {
    const user_id = getUserId(req);
    const year = req.query.year;

    let yearFilter = "";
    let params = [user_id];

    if (year && year !== "all") {
      yearFilter = "AND EXTRACT(YEAR FROM s.created_at) = $2";
      params.push(year);
    }

    const result = await pool.query(
      `
      SELECT 
        TO_CHAR(s.created_at, 'Mon') AS month,
        SUM(s.total_price) AS total_sales,
        SUM((s.selling_price - i.buying_rate) * s.quantity) AS total_profit
      FROM sales s
      JOIN items i ON i.id = s.item_id
      WHERE s.user_id = $1
      ${yearFilter}
      GROUP BY month
      ORDER BY MIN(s.created_at)
      `,
      params,
    );

    res.json(result.rows);
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

// Last 13 months chart
router.get("/sales/last-13-months", async (req, res) => {
  try {
    const user_id = getUserId(req);

    const result = await pool.query(
      `
      WITH months AS (
        SELECT DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '12 months'
        + (INTERVAL '1 month' * generate_series(0,12)) AS month_start
      )
      SELECT 
        TO_CHAR(m.month_start, 'Mon YYYY') AS month,
        COALESCE(SUM(s.total_price), 0) AS total_sales
      FROM months m
      LEFT JOIN sales s
        ON DATE_TRUNC('month', s.created_at AT TIME ZONE 'Asia/Kolkata') = m.month_start
        AND s.user_id = $1
      GROUP BY m.month_start
      ORDER BY m.month_start ASC
      `,
      [user_id],
    );

    res.json(result.rows);
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

// =========================================================
// GLOBAL ROUTE ERROR HANDLER
// =========================================================
router.use((err, req, res, next) => {
  console.error("Route error:", err);
  res.status(500).json({ error: "Unexpected server error" });
});

module.exports = router;
