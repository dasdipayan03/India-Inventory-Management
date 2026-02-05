// routes/inventory.js
const express = require("express");
const jwt = require("jsonwebtoken");
const pool = require("../db");
const PDFDocument = require("pdfkit");
const ExcelJS = require("exceljs");
const { authMiddleware, getUserId } = require("../middleware/auth");

const router = express.Router();

/* =========================================================
   AUTH HANDLING
   ========================================================= */

// ⛔ Bypass authMiddleware for download routes only
router.use(
  ["/sales/report/pdf", "/sales/report/excel"],
  (req, res, next) => next()
);

// ✅ Protect all other routes
router.use(authMiddleware);

/* =========================================================
   ITEMS
   ========================================================= */

// Add or update stock item
router.post("/items", async (req, res) => {
  try {
    const user_id = getUserId(req);
    const { name, quantity, buying_rate, selling_rate } = req.body;

    if (!name || quantity == null || buying_rate == null || selling_rate == null) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const qty = parseFloat(quantity);
    const buyRate = parseFloat(buying_rate);
    const sellRate = parseFloat(selling_rate);

    const check = await pool.query(
      "SELECT * FROM items WHERE user_id=$1 AND LOWER(TRIM(name))=LOWER($2)",
      [user_id, name.trim()]
    );

    if (check.rows.length > 0) {
      const existing = check.rows[0];
      const newQty = parseFloat(existing.quantity) + qty;

      const result = await pool.query(
        `
        UPDATE items
        SET quantity=$1, buying_rate=$2, selling_rate=$3, updated_at=NOW()
        WHERE id=$4 AND user_id=$5
        RETURNING *
        `,
        [newQty, buyRate, sellRate, existing.id, user_id]
      );

      return res.json({ message: "Stock updated", item: result.rows[0] });
    }

    const result = await pool.query(
      `
      INSERT INTO items (user_id, name, quantity, buying_rate, selling_rate)
      VALUES ($1,$2,$3,$4,$5)
      RETURNING *
      `,
      [user_id, name.trim(), qty, buyRate, sellRate]
    );

    res.json({ message: "New item added", item: result.rows[0] });
  } catch (err) {
    console.error("POST /items error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Item name list
router.get("/items/names", async (req, res) => {
  try {
    const user_id = getUserId(req);
    const result = await pool.query(
      "SELECT name FROM items WHERE user_id=$1 ORDER BY name ASC",
      [user_id]
    );
    res.json(result.rows.map(r => r.name));
  } catch (err) {
    console.error("GET /items/names error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Item info
router.get("/items/info", async (req, res) => {
  try {
    const user_id = getUserId(req);
    const { name } = req.query;
    if (!name) return res.status(400).json({ error: "Missing item name" });

    const result = await pool.query(
      `SELECT id, name, quantity, selling_rate
       FROM items
       WHERE user_id=$1 AND LOWER(TRIM(name))=LOWER($2)`,
      [user_id, name.trim()]
    );

    if (!result.rows.length)
      return res.status(404).json({ error: "Item not found" });

    res.json(result.rows[0]);
  } catch (err) {
    console.error("GET /items/info error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* =========================================================
   SALES REPORT (JSON)
   ========================================================= */

router.get("/sales/report", async (req, res) => {
  try {
    const user_id = getUserId(req);
    const { from, to } = req.query;

    if (!from || !to)
      return res.status(400).json({ error: "Missing date range" });

    const result = await pool.query(
      `
      SELECT s.created_at, i.name AS item_name,
             s.quantity, s.selling_price, s.total_price
      FROM sales s
      JOIN items i ON i.id=s.item_id
      WHERE s.user_id=$1
        AND (s.created_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $2 AND $3
      ORDER BY s.created_at ASC
      `,
      [user_id, from, to]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Sales report error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* =========================================================
   SALES REPORT PDF
   ========================================================= */

router.get("/sales/report/pdf", async (req, res) => {
  try {
    const token =
      req.query.token || req.headers.authorization?.split(" ")[1];

    if (!token) return res.status(401).json({ error: "Unauthorized" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user_id = decoded.id;

    const { from, to } = req.query;
    if (!from || !to)
      return res.status(400).json({ error: "Missing date range" });

    const { rows } = await pool.query(
      `
      SELECT s.created_at, i.name AS item_name,
             s.quantity, s.selling_price, s.total_price
      FROM sales s
      JOIN items i ON i.id=s.item_id
      WHERE s.user_id=$1
        AND (s.created_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $2 AND $3
      ORDER BY s.created_at ASC
      `,
      [user_id, from, to]
    );

    if (!rows.length)
      return res.status(404).json({ error: "No sales found" });

    const doc = new PDFDocument({ size: "A4", margin: 30 });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=Sales_Report_${from}_to_${to}.pdf`
    );

    doc.pipe(res);

    doc.fontSize(18).text("Sales Report", { align: "center" });
    doc.moveDown();
    doc.fontSize(11).text(`From: ${from}   To: ${to}`, { align: "center" });
    doc.moveDown();

    const headers = ["Date", "Item", "Qty", "Rate", "Total"];
    const widths = [90, 160, 60, 80, 80];

    let y = doc.y;

    doc.font("Helvetica-Bold").fontSize(10);
    headers.forEach((h, i) => {
      doc.text(h, 30 + widths.slice(0, i).reduce((a, b) => a + b, 0), y, {
        width: widths[i],
        align: "center",
      });
    });

    y += 20;
    doc.font("Helvetica").fontSize(9);

    let grandTotal = 0;

    rows.forEach(r => {
      const date = new Date(r.created_at).toLocaleDateString("en-IN", {
        timeZone: "Asia/Kolkata",
      });

      const row = [
        date,
        r.item_name,
        r.quantity,
        r.selling_price.toFixed(2),
        r.total_price.toFixed(2),
      ];

      row.forEach((val, i) => {
        doc.text(val, 30 + widths.slice(0, i).reduce((a, b) => a + b, 0), y, {
          width: widths[i],
          align: "center",
        });
      });

      grandTotal += Number(r.total_price);
      y += 18;

      if (y > 760) {
        doc.addPage();
        y = 50;
      }
    });

    doc.moveDown();
    doc.font("Helvetica-Bold")
      .fontSize(12)
      .text(`Grand Total: ₹${grandTotal.toFixed(2)}`, { align: "right" });

    doc.end();
  } catch (err) {
    console.error("PDF report error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* =========================================================
   SALES REPORT EXCEL
   ========================================================= */

router.get("/sales/report/excel", async (req, res) => {
  try {
    const token =
      req.query.token || req.headers.authorization?.split(" ")[1];

    if (!token) return res.status(401).json({ error: "Unauthorized" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user_id = decoded.id;

    const { from, to } = req.query;
    if (!from || !to)
      return res.status(400).json({ error: "Missing date range" });

    const { rows } = await pool.query(
      `
      SELECT s.created_at, i.name AS item_name,
             s.quantity, s.selling_price, s.total_price
      FROM sales s
      JOIN items i ON i.id=s.item_id
      WHERE s.user_id=$1
        AND (s.created_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $2 AND $3
      ORDER BY s.created_at ASC
      `,
      [user_id, from, to]
    );

    if (!rows.length)
      return res.status(404).json({ error: "No sales found" });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Sales Report");

    sheet.addRow(["Date", "Item", "Quantity", "Rate", "Total"]);

    let grandTotal = 0;
    rows.forEach(r => {
      sheet.addRow([
        new Date(r.created_at).toLocaleDateString("en-IN"),
        r.item_name,
        r.quantity,
        r.selling_price,
        r.total_price,
      ]);
      grandTotal += Number(r.total_price);
    });

    sheet.addRow([]);
    sheet.addRow(["", "", "", "Grand Total", grandTotal]);

    res.setHeader(
      "Content-Disposition",
      `attachment; filename=Sales_Report_${from}_to_${to}.xlsx`
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("Excel report error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* =========================================================
   DEBTS (UNCHANGED)
   ========================================================= */

router.post("/debts", async (req, res) => {
  try {
    const user_id = getUserId(req);
    const { customer_name, customer_number, total = 0, credit = 0 } = req.body;

    if (!customer_name || !/^\d{10}$/.test(customer_number))
      return res.status(400).json({ error: "Invalid customer details" });

    const result = await pool.query(
      `INSERT INTO debts (user_id, customer_name, customer_number, total, credit)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [user_id, customer_name, customer_number, total, credit]
    );

    res.json({ message: "Debt added", debt: result.rows[0] });
  } catch (err) {
    console.error("POST /debts error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/debts/:number", async (req, res) => {
  try {
    const user_id = getUserId(req);
    const { number } = req.params;

    const result = await pool.query(
      `SELECT * FROM debts
       WHERE user_id=$1 AND customer_number=$2
       ORDER BY created_at ASC`,
      [user_id, number]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("GET /debts/:number error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/debts", async (req, res) => {
  try {
    const user_id = getUserId(req);
    const result = await pool.query(
      `
      SELECT customer_name, customer_number,
             SUM(total) AS total,
             SUM(credit) AS credit,
             SUM(total-credit) AS balance
      FROM debts
      WHERE user_id=$1
      GROUP BY customer_name, customer_number
      ORDER BY customer_name
      `,
      [user_id]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("GET /debts error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
