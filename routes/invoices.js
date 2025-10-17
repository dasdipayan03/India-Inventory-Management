// routes/invoices.js
const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');
const pool = require('../db');
const { authMiddleware } = require('../middleware/auth');
const GST_RATE = 0.18;

/* ---------------------- Helper: pad serial ---------------------- */
function padSerial(n) {
    return String(n).padStart(4, '0');
}

/* ---------------------- Generate Invoice No (uses given client) ---------------------- */
async function generateInvoiceNoWithClient(client, userId) {
    const todayDate = new Date().toLocaleString('en-CA', { timeZone: 'Asia/Kolkata' }).slice(0, 10);
    const dateKey = todayDate;
    const datePart = todayDate.replace(/-/g, '');

    const q = `
    INSERT INTO user_invoice_counter (user_id, date_key, next_no)
    VALUES ($1, $2, 2)
    ON CONFLICT (user_id, date_key)
    DO UPDATE SET next_no = user_invoice_counter.next_no + 1
    RETURNING next_no;
  `;
    const r = await client.query(q, [userId, dateKey]);
    const returnedNext = Number(r.rows[0].next_no);
    const assignedSerial = returnedNext - 1;
    const seqStr = padSerial(assignedSerial);
    const invoiceNo = `INV-${datePart}-${userId}-${seqStr}`;
    return { invoiceNo, dateKey };
}

/* ---------------------- GET: Preview Next Invoice (no counter increment) ---------------------- */
router.get('/invoices/new', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const client = await pool.connect();
    try {
        const todayDate = new Date().toLocaleString('en-CA', { timeZone: 'Asia/Kolkata' }).slice(0, 10);
        const datePart = todayDate.replace(/-/g, '');
        const q = `SELECT next_no FROM user_invoice_counter WHERE user_id=$1 AND date_key=$2`;
        const r = await client.query(q, [userId, todayDate]);
        const nextNo = r.rowCount > 0 ? r.rows[0].next_no : 1;
        const seqStr = padSerial(nextNo);
        const invoiceNo = `INV-${datePart}-${userId}-${seqStr}`;
        res.json({ success: true, invoice_no: invoiceNo, date: new Date().toISOString() });
    } catch (err) {
        console.error('❌ Error generating invoice preview:', err);
        res.status(500).json({ success: false, message: 'Error generating invoice preview' });
    } finally {
        client.release();
    }
});

/* ---------------------- POST: Save Invoice (auto-download ready) ---------------------- */
router.post('/invoices', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { customer_name, contact, address, gst_no, items } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0)
        return res.status(400).json({ success: false, message: 'Invoice must have at least one item' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { invoiceNo, dateKey } = await generateInvoiceNoWithClient(client, userId);

        // Calculate totals
        let subtotal = 0;
        const computedItems = items.map(it => {
            const qty = Number(it.quantity || 0);
            const rate = Number(it.rate || 0);
            const amount = +(qty * rate).toFixed(2);
            subtotal += amount;
            return { description: it.description || '', quantity: qty, rate, amount };
        });
        subtotal = +subtotal.toFixed(2);
        // Fetch user's GST rate from settings
        const gstRes = await client.query(`SELECT gst_rate FROM settings WHERE user_id=$1`, [userId]);
        const userGstRate = gstRes.rows[0]?.gst_rate || 18.0;

        const gst_amount = +(subtotal * (userGstRate / 100)).toFixed(2);
        const total_amount = +(subtotal + gst_amount).toFixed(2);


        // Insert invoice record
        const invQ = `
      INSERT INTO invoices (invoice_no, user_id, gst_no, customer_name, contact, address, subtotal, gst_amount, total_amount, date)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING id, invoice_no;
    `;
        const invRes = await client.query(invQ, [
            invoiceNo, userId, gst_no || null, customer_name || null, contact || null,
            address || null, subtotal, gst_amount, total_amount, dateKey
        ]);
        const invoiceId = invRes.rows[0].id;

        // Insert all invoice items
        const itemQ = `INSERT INTO invoice_items (invoice_id, description, quantity, rate, amount)
                   VALUES ($1,$2,$3,$4,$5)`;
        for (const it of computedItems)
            await client.query(itemQ, [invoiceId, it.description, it.quantity, it.rate, it.amount]);

        await client.query('COMMIT');
        await new Promise(r => setTimeout(r, 100));

        res.json({ success: true, invoice_no: invoiceNo });
    } catch (err) {
        await client.query('ROLLBACK').catch(() => { });
        console.error('❌ Error saving invoice:', err);
        if (err.code === '23505') {
            return res.status(409).json({ success: false, message: 'Duplicate invoice number, please try again' });
        }
        res.status(500).json({ success: false, message: err.message || 'Invoice saving failed' });
    } finally {
        client.release();
    }
});

/* ---------------------- GET Invoice Details ---------------------- */
router.get('/invoices/:invoiceNo', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const invoiceNo = req.params.invoiceNo.replace(/['"%]+/g, '').trim();
    try {
        const q = `
      SELECT i.id, i.invoice_no, i.customer_name, i.contact, i.address, i.gst_no,
             i.date, i.subtotal, i.gst_amount, i.total_amount,
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
        if (!rows[0]) return res.status(404).json({ success: false, message: 'Invoice not found' });
        res.json({ success: true, invoice: rows[0] });
    } catch (err) {
        console.error('❌ Error fetching invoice:', err.message);
        res.status(500).json({ success: false, message: 'Error fetching invoice' });
    }
});

/* ---------------------- GET Generate PDF ---------------------- */
router.get('/invoices/:invoiceNo/pdf', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const invoiceNo = req.params.invoiceNo.replace(/['"%]+/g, '').trim();

    try {
        const q = `
      SELECT i.id, i.invoice_no, i.customer_name, i.contact, i.address, i.gst_no,
             i.date, i.subtotal, i.gst_amount, i.total_amount,
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
        if (!rows[0]) return res.status(404).json({ success: false, message: 'Invoice not found' });
        const inv = rows[0];

        const shopRes = await pool.query(`SELECT shop_name, shop_address, gst_no FROM settings WHERE user_id=$1`, [userId]);
        const shop = shopRes.rows[0] || {};
        const companyName = shop.shop_name || "India Inventory Management";
        const companyAddress = shop.shop_address || "India";
        const companyGST = shop.gst_no || inv.gst_no || "GST Not Set";

        const doc = new PDFDocument({ size: 'A4', margin: 40 });
        const filename = `${inv.invoice_no}.pdf`;
        res.setHeader('Content-disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-type', 'application/pdf');
        doc.pipe(res);

        const headerTop = 40;
        doc.fontSize(18).fillColor("#2563eb").text(companyName, 40, headerTop);
        doc.fontSize(10).fillColor("#333").text(companyAddress, 40, headerTop + 20).text(`GSTIN: ${companyGST}`, 40, headerTop + 35);
        doc.fontSize(18).fillColor("#000").text("INVOICE", 0, headerTop, { align: "right" });
        let currentY = headerTop + 70;

        doc.rect(40, currentY, 520, 80).strokeColor("#2563eb").stroke();
        const dateStr = new Date(inv.date).toLocaleDateString("en-IN");
        doc.fontSize(10).fillColor("#000");
        doc.text(`Invoice No: ${inv.invoice_no}`, 50, currentY + 10);
        doc.text(`Invoice Date: ${dateStr}`, 50, currentY + 25);
        doc.text(`Bill To:`, 320, currentY + 10);
        doc.text(`${inv.customer_name || ""}`, 320, currentY + 25);
        if (inv.contact) doc.text(`Contact: ${inv.contact}`, 320, currentY + 40);
        if (inv.address) doc.text(`Address: ${inv.address}`, 320, currentY + 55, { width: 220 });

        let y = currentY + 100;
        doc.moveTo(40, y).lineTo(560, y).strokeColor("#2563eb").stroke();
        y += 8;

        doc.fontSize(10).font("Helvetica-Bold");
        doc.text("Description", 45, y);
        doc.text("Qty", 300, y, { width: 40, align: "right" });
        doc.text("Rate", 370, y, { width: 80, align: "right" });
        doc.text("Amount", 470, y, { width: 90, align: "right" });
        y += 12;
        doc.moveTo(40, y).lineTo(560, y).strokeColor("#2563eb").stroke();

        doc.font("Helvetica").fillColor("#000");
        for (const it of inv.items) {
            y += 16;
            if (y > 680) { doc.addPage(); y = 60; }
            doc.text(it.description, 45, y, { width: 240 });
            doc.text(Number(it.quantity).toFixed(2), 300, y, { width: 50, align: "right" });
            doc.text(Number(it.rate).toFixed(2), 370, y, { width: 80, align: "right" });
            doc.text(Number(it.amount).toFixed(2), 470, y, { width: 90, align: "right" });
        }

        y += 10; doc.moveTo(40, y).lineTo(560, y).strokeColor("#2563eb").stroke(); y += 30;
        const labelX = 350, valueX = 500;
        doc.font("Helvetica-Bold").fontSize(10).fillColor("#000");
        doc.text("Subtotal:", labelX, y, { width: 120, align: "right" });
        doc.text(Number(inv.subtotal).toFixed(2), valueX, y, { width: 80, align: "right" });
        y += 20;
        const gstRes = await pool.query(`SELECT gst_rate FROM settings WHERE user_id=$1`, [userId]);
        const userGstRate = gstRes.rows[0]?.gst_rate || 18.0;
        doc.text(`GST:`, labelX, y, { width: 120, align: "right" });
        doc.text(Number(inv.gst_amount).toFixed(2), valueX, y, { width: 80, align: "right" });
        y += 25;
        doc.fontSize(12).fillColor("#2563eb");
        doc.text("Total:", labelX, y, { width: 120, align: "right" });
        doc.text(Number(inv.total_amount).toFixed(2), valueX, y, { width: 80, align: "right" });
        y += 60;
        doc.fontSize(10).fillColor("#000");
        doc.text("For " + companyName, 400, y);
        y += 30;
        doc.text("(Authorized Signatory)", 410, y);
        doc.fontSize(9).fillColor("#555");
        doc.text("This is a computer-generated invoice. Thank you!", 0, 780, { align: "center" });
        doc.end();
    } catch (err) {
        console.error('❌ Error generating PDF:', err.message);
        res.status(500).json({ success: false, message: 'Error generating PDF' });
    }
});

/* ---------------------- POST: Save or Update Shop Info ---------------------- */
router.post('/shop-info', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { shop_name, shop_address, gst_no, gst_rate } = req.body;


    try {
        await pool.query(`
      CREATE TABLE IF NOT EXISTS settings (
        id SERIAL PRIMARY KEY,
        user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        shop_name TEXT,
        shop_address TEXT,
    gst_no TEXT,
    gst_rate NUMERIC DEFAULT 18.0
      );
    `);

        await pool.query(`
  INSERT INTO settings (user_id, shop_name, shop_address, gst_no, gst_rate)
  VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (user_id)
      DO UPDATE SET
        shop_name = EXCLUDED.shop_name,
        shop_address = EXCLUDED.shop_address,
    gst_no = EXCLUDED.gst_no,
    gst_rate = EXCLUDED.gst_rate;
`, [userId, shop_name, shop_address, gst_no, gst_rate]
        );


        const { rows } = await pool.query(
            `SELECT shop_name, shop_address, gst_no, gst_rate FROM settings WHERE user_id=$1`,
            [userId]
        );
        res.json({ success: true, settings: rows[0] || {} });

    } catch (err) {
        console.error('❌ Error saving shop info:', err.message);
        res.status(500).json({ success: false, message: 'Error saving shop info' });
    }
    /* ---------------------- GET: Fetch Shop Info ---------------------- */
    router.get('/shop-info', authMiddleware, async (req, res) => {
        const userId = req.user.id;
        try {
            const { rows } = await pool.query(
                `SELECT shop_name, shop_address, gst_no, gst_rate FROM settings WHERE user_id=$1`,
                [userId]
            );
            res.json({ success: true, settings: rows[0] || {} });
        } catch (err) {
            console.error('❌ Error fetching shop info:', err.message);
            res.status(500).json({ success: false, message: 'Error fetching shop info' });
        }
    });

});

/* ---------------------- Mirror endpoints for /settings/gst ---------------------- */
router.get('/settings/gst', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    try {
        const { rows } = await pool.query(`SELECT shop_name, shop_address, gst_no FROM settings WHERE user_id=$1`, [userId]);
        res.json({ success: true, settings: rows[0] || {} });
    } catch (err) {
        console.error('❌ Error fetching settings:', err.message);
        res.status(500).json({ success: false, message: 'Error fetching settings' });
    }
});

router.post('/settings/gst', authMiddleware, async (req, res) => {
    req.url = '/shop-info';
    router.handle(req, res);
});

module.exports = router;
