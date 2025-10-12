// routes/invoices.js
const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');
const pool = require('../db');
const { authMiddleware } = require('../middleware/auth');
const GST_RATE = 0.18;

/* ---------------------- Generate Unique Invoice Number (Timezone Safe) ---------------------- */
async function generateInvoiceNo(userId) {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const datePart = `${yyyy}${mm}${dd}`;

    const client = await pool.connect();
    try {
        // 🔒 Lock to prevent duplicates
        await client.query('BEGIN');
        await client.query('LOCK TABLE invoices IN ROW EXCLUSIVE MODE');

        const q = `
            SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_no FROM 14 FOR 4) AS INTEGER)), 0) + 1 AS next_seq
            FROM invoices
            WHERE user_id = $1
              AND to_char(date, 'YYYYMMDD') = $2
        `;
        const res = await client.query(q, [userId, datePart]);
        const seq = res.rows[0]?.next_seq || 1;
        const seqStr = String(seq).padStart(4, '0');
        const invoiceNo = `INV-${datePart}-${seqStr}`;

        await client.query('COMMIT');
        console.log(`🧾 Generated invoice for user ${userId}: ${invoiceNo}`);
        return invoiceNo;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

/* ---------------------- Always Return Fresh Invoice Number ---------------------- */
router.get('/invoices/new', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    try {
        const invoiceNo = await generateInvoiceNo(userId);
        res.json({ success: true, invoice_no: invoiceNo, date: new Date().toISOString() });
    } catch (err) {
        console.error('❌ Error generating invoice number:', err.message);
        res.status(500).json({ success: false, message: 'Error generating invoice number' });
    }
});

/* ---------------------- SHOP SETTINGS (Save & Get) ---------------------- */
router.post('/settings/gst', authMiddleware, async (req, res) => {
    const { gst_no, shop_name, shop_address } = req.body;
    const userId = req.user.id;
    const client = await pool.connect();

    try {
        const upsert = `
            INSERT INTO settings (user_id, gst_no, shop_name, shop_address)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (user_id)
            DO UPDATE SET gst_no = EXCLUDED.gst_no,
                          shop_name = EXCLUDED.shop_name,
                          shop_address = EXCLUDED.shop_address
            RETURNING gst_no, shop_name, shop_address
        `;
        const result = await client.query(upsert, [userId, gst_no, shop_name, shop_address]);
        res.json({ success: true, settings: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Error saving shop info' });
    } finally {
        client.release();
    }
});

router.get('/settings/gst', authMiddleware, async (req, res) => {
    try {
        const q = `SELECT gst_no, shop_name, shop_address FROM settings WHERE user_id = $1`;
        const { rows } = await pool.query(q, [req.user.id]);
        res.json({ success: true, settings: rows[0] || null });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Error fetching shop info' });
    }
});

/* ---------------------- POST Save Invoice ---------------------- */
router.post('/invoices', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { customer_name, contact, address, gst_no, items } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0)
        return res.status(400).json({ success: false, message: 'Invoice must have at least one item' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const invoice_no = await generateInvoiceNo(userId);
        let subtotal = 0;
        const computedItems = items.map(it => {
            const qty = Number(it.quantity || 0);
            const rate = Number(it.rate || 0);
            const amount = +(qty * rate).toFixed(2);
            subtotal += amount;
            return { description: it.description || '', quantity: qty, rate, amount };
        });

        subtotal = +subtotal.toFixed(2);
        const gst_amount = +(subtotal * GST_RATE).toFixed(2);
        const total_amount = +(subtotal + gst_amount).toFixed(2);

        const invQ = `
            INSERT INTO invoices (invoice_no, user_id, gst_no, customer_name, contact, address, subtotal, gst_amount, total_amount)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, invoice_no
        `;
        const invRes = await client.query(invQ, [
            invoice_no, userId, gst_no || null, customer_name || null, contact || null,
            address || null, subtotal, gst_amount, total_amount
        ]);
        const invoiceId = invRes.rows[0].id;

        const itemQ = `INSERT INTO invoice_items (invoice_id, description, quantity, rate, amount)
                       VALUES ($1,$2,$3,$4,$5)`;
        for (const it of computedItems)
            await client.query(itemQ, [invoiceId, it.description, it.quantity, it.rate, it.amount]);

        await client.query('COMMIT');
        res.json({ success: true, invoice_no });
    } catch (err) {
        await client.query('ROLLBACK').catch(() => { });
        console.error('❌ Error saving invoice:', err.message);
        res.status(500).json({ success: false, message: err.message });
    } finally {
        client.release();
    }
});

/* ---------------------- GET Invoice by Number (Safe Search) ---------------------- */
router.get('/invoices/:invoiceNo', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const rawNo = req.params.invoiceNo;
    const invoiceNo = rawNo.replace(/['"%]+/g, '').trim();

    console.log('🔍 Searching invoice:', invoiceNo, 'for user:', userId);

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
            LIMIT 1
        `;
        const { rows } = await pool.query(q, [invoiceNo, userId]);
        if (!rows[0]) {
            console.warn('❌ Invoice not found:', invoiceNo);
            return res.status(404).json({ success: false, message: 'Invoice not found' });
        }

        res.json({ success: true, invoice: rows[0] });
    } catch (err) {
        console.error('❌ Error fetching invoice:', err.message);
        res.status(500).json({ success: false, message: 'Error fetching invoice' });
    }
});

/* ---------------------- GET Generate Professional PDF ---------------------- */
router.get('/invoices/:invoiceNo/pdf', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const rawNo = req.params.invoiceNo;
    const invoiceNo = rawNo.replace(/['"%]+/g, '').trim();

    console.log('🧾 Generating PDF for:', invoiceNo, 'user:', userId);

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
            LIMIT 1
        `;
        const { rows } = await pool.query(q, [invoiceNo, userId]);
        if (!rows[0]) return res.status(404).json({ success: false, message: 'Invoice not found' });

        const inv = rows[0];

        // 🏪 Fetch user shop info
        const shopRes = await pool.query(
            `SELECT shop_name, shop_address, gst_no FROM settings WHERE user_id = $1`,
            [userId]
        );
        const shop = shopRes.rows[0] || {};
        const companyName = shop.shop_name || "India Inventory Management";
        const companyAddress = shop.shop_address || "India";
        const companyGST = shop.gst_no || inv.gst_no || "GST Not Set";

        const doc = new PDFDocument({ size: 'A4', margin: 40 });
        const filename = `${inv.invoice_no}.pdf`;

        res.setHeader('Content-disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-type', 'application/pdf');
        doc.pipe(res);

        // HEADER
        doc.fontSize(18).fillColor("#2563eb").text(companyName, 40, 40);
        doc.fontSize(10).fillColor("#333").text(companyAddress, 40, 60);
        doc.text(`GSTIN: ${companyGST}`, 40, 75);
        doc.fontSize(20).fillColor("#000").text("INVOICE", { align: "right" });
        let currentY = doc.y + 15; // Adds 15px space below the heading

        // BOX + DETAILS
        const yTop = 100;
        doc.rect(40, yTop, 520, 80).strokeColor("#2563eb").stroke();
        const dateStr = new Date(inv.date).toLocaleDateString("en-IN");
        doc.fontSize(10).fillColor("#000");
        doc.text(`Invoice No: ${inv.invoice_no}`, 50, yTop + 10);
        doc.text(`Invoice Date: ${dateStr}`, 50, yTop + 25)

        doc.text(`Bill To:`, 320, yTop + 10);
        doc.text(`${inv.customer_name || ""}`, 320, yTop + 25);
        if (inv.contact) doc.text(`Contact: ${inv.contact}`, 320, yTop + 40);
        if (inv.address) doc.text(`Address: ${inv.address}`, 320, yTop + 55, { width: 220 });

        // --- ITEM TABLE HEADER ---
        let y = yTop + 100; // after customer box
        doc.moveTo(40, y).lineTo(560, y).strokeColor("#2563eb").stroke(); // header top border
        y += 8;

        doc.fontSize(10).font("Helvetica-Bold");
        doc.text("Description", 45, y);
        doc.text("Qty", 300, y, { width: 40, align: "right" });
        doc.text("Rate", 370, y, { width: 80, align: "right" });
        doc.text("Amount", 470, y, { width: 90, align: "right" });

        y += 12;
        doc.moveTo(40, y).lineTo(560, y).strokeColor("#2563eb").stroke(); // underline header

        // --- ITEM ROWS ---
        doc.font("Helvetica").fillColor("#000");
        const items = inv.items || [];

        for (const it of items) {
            y += 16;
            if (y > 680) {
                doc.addPage();
                y = 60;
            }
            doc.text(it.description, 45, y, { width: 240 });
            doc.text(Number(it.quantity).toFixed(2), 300, y, { width: 50, align: "right" });
            doc.text(Number(it.rate).toFixed(2), 370, y, { width: 80, align: "right" });
            doc.text(Number(it.amount).toFixed(2), 470, y, { width: 90, align: "right" });
        }

        // --- BLUE LINE BELOW LAST ITEM ---
        y += 10;
        doc.moveTo(40, y).lineTo(560, y).strokeColor("#2563eb").stroke(); // ✅ bottom divider

        // --- SPACE BELOW TABLE ---
        y += 30;

        // --- TOTALS SECTION (perfectly aligned) ---
        const labelX = 350;
        const valueX = 500;

        doc.font("Helvetica-Bold").fontSize(10).fillColor("#000");
        doc.text("Subtotal:", labelX, y, { width: 120, align: "right" });
        doc.text(Number(inv.subtotal).toFixed(2), valueX, y, { width: 80, align: "right" });

        y += 20;
        doc.text("GST (18%):", labelX, y, { width: 120, align: "right" });
        doc.text(Number(inv.gst_amount).toFixed(2), valueX, y, { width: 80, align: "right" });

        y += 25;
        doc.fontSize(12).fillColor("#2563eb");
        doc.text("Total:", labelX, y, { width: 120, align: "right" });
        doc.text(Number(inv.total_amount).toFixed(2), valueX, y, { width: 80, align: "right" });

        // --- SIGNATURE & FOOTER ---
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

module.exports = router;
