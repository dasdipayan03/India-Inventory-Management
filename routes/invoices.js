// routes/invoices.js
const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');
const pool = require('../db');
const { authMiddleware } = require('../middleware/auth');

/* ---------------------- Helper: pad serial ---------------------- */
function padSerial(n) {
    return String(n).padStart(4, '0');
}

/* ---------------------- Generate Invoice No ---------------------- */
async function generateInvoiceNoWithClient(client, userId) {
    const todayDate = new Date()
        .toLocaleString('en-CA', { timeZone: 'Asia/Kolkata' })
        .slice(0, 10);

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
    const assignedSerial = Number(r.rows[0].next_no) - 1;
    const seqStr = padSerial(assignedSerial);

    return {
        invoiceNo: `INV-${datePart}-${userId}-${seqStr}`,
        dateKey
    };
}

/* ---------------------- GET: Preview Next Invoice ---------------------- */
router.get('/invoices/new', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const client = await pool.connect();
    try {
        const todayDate = new Date()
            .toLocaleString('en-CA', { timeZone: 'Asia/Kolkata' })
            .slice(0, 10);

        const datePart = todayDate.replace(/-/g, '');
        const q = `SELECT next_no FROM user_invoice_counter WHERE user_id=$1 AND date_key=$2`;
        const r = await client.query(q, [userId, todayDate]);
        const nextNo = r.rowCount ? r.rows[0].next_no : 1;

        res.json({
            success: true,
            invoice_no: `INV-${datePart}-${userId}-${padSerial(nextNo)}`,
            date: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
        });
    } catch (err) {
        res.status(500).json({ success: false });
    } finally {
        client.release();
    }
});

/* ---------------------- POST: SAVE INVOICE (FINAL LOGIC) ---------------------- */
router.post('/invoices', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { customer_name, contact, address, gst_no, items } = req.body;

    if (!Array.isArray(items) || !items.length) {
        return res.status(400).json({ success: false, message: 'No items' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const { invoiceNo, dateKey } = await generateInvoiceNoWithClient(client, userId);

        /* ---- calculate ---- */
        let subtotal = 0;
        const computed = items.map(i => {
            const q = Number(i.quantity || 0);
            const r = Number(i.rate || 0);
            const a = +(q * r).toFixed(2);
            subtotal += a;
            return { description: i.description, quantity: q, rate: r, amount: a };
        });
        subtotal = +subtotal.toFixed(2);

        const gstR = await client.query(`SELECT gst_rate FROM settings WHERE user_id=$1`, [userId]);
        const gstRate = gstR.rows[0]?.gst_rate || 18;
        const gst_amount = +(subtotal * gstRate / 100).toFixed(2);
        const total_amount = +(subtotal + gst_amount).toFixed(2);

        /* ---- invoice ---- */
        const inv = await client.query(`
          INSERT INTO invoices
          (invoice_no,user_id,gst_no,customer_name,contact,address,
           subtotal,gst_amount,total_amount,date)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
          RETURNING id
        `, [
            invoiceNo, userId, gst_no || null,
            customer_name || null, contact || null, address || null,
            subtotal, gst_amount, total_amount, new Date()
        ]);

        const invoiceId = inv.rows[0].id;

        /* ---- invoice_items + stock + sales ---- */
        for (const it of computed) {

            await client.query(`
              INSERT INTO invoice_items
              (invoice_id,description,quantity,rate,amount)
              VALUES ($1,$2,$3,$4,$5)
            `, [invoiceId, it.description, it.quantity, it.rate, it.amount]);

            const itemRow = await client.query(`
              SELECT id, quantity FROM items
              WHERE user_id=$1 AND LOWER(TRIM(name))=LOWER(TRIM($2))
              FOR UPDATE
            `, [userId, it.description]);

            if (!itemRow.rowCount) {
                throw new Error(`Item not found: ${it.description}`);
            }
            if (itemRow.rows[0].quantity < it.quantity) {
                throw new Error(`Insufficient stock: ${it.description}`);
            }

            await client.query(`
              UPDATE items SET quantity = quantity - $1 WHERE id=$2
            `, [it.quantity, itemRow.rows[0].id]);

            await client.query(`
                INSERT INTO sales
                (user_id, item_id, quantity, selling_price, total_price)
                VALUES ($1, $2, $3, $4, $5)
                `, [
                userId,
                itemRow.rows[0].id,
                it.quantity,
                it.rate,      // ✅ unit selling price
                it.amount     // ✅ total price
            ]);

        }

        await client.query('COMMIT');
        res.json({ success: true, invoice_no: invoiceNo });

    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ success: false, message: err.message });
    } finally {
        client.release();
    }
});

/* ---------------------- GET: Invoice Details ---------------------- */
router.get('/invoices/:invoiceNo', authMiddleware, async (req, res) => {
    const { rows } = await pool.query(`
      SELECT i.*, COALESCE(json_agg(ii.*)
      FILTER (WHERE ii.id IS NOT NULL),'[]') AS items
      FROM invoices i
      LEFT JOIN invoice_items ii ON ii.invoice_id=i.id
      WHERE i.user_id=$2 AND i.invoice_no=$1
      GROUP BY i.id
    `, [req.params.invoiceNo, req.user.id]);

    if (!rows[0]) return res.status(404).json({ success: false });
    res.json({ success: true, invoice: rows[0] });
});

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

        const shopRes = await pool.query(
            `SELECT shop_name, shop_address, gst_no FROM settings WHERE user_id=$1`,
            [userId]
        );
        const shop = shopRes.rows[0] || {};

        const doc = new PDFDocument({ size: 'A4', margin: 40 });
        res.setHeader('Content-disposition', `attachment; filename="${inv.invoice_no}.pdf"`);
        res.setHeader('Content-type', 'application/pdf');
        doc.pipe(res);

        doc.fontSize(18).text(shop.shop_name || 'India Inventory Management', 40, 40);
        doc.fontSize(10).text(shop.shop_address || '', 40, 65);
        doc.text(`GSTIN: ${shop.gst_no || inv.gst_no || ''}`, 40, 80);
        doc.fontSize(16).text('INVOICE', 450, 40);

        let y = 130;
        doc.fontSize(10);
        doc.text(`Invoice No: ${inv.invoice_no}`, 40, y);
        doc.text(
            `Date: ${new Date(inv.date).toLocaleString('en-IN', {
                timeZone: 'Asia/Kolkata'
            })}`,
            40,
            y + 15
        );


        doc.text(`Customer: ${inv.customer_name || ''}`, 300, y);
        if (inv.contact) doc.text(`Contact: ${inv.contact}`, 300, y + 15);
        if (inv.address) doc.text(`Address: ${inv.address}`, 300, y + 30, { width: 240 });

        y += 70;
        doc.moveTo(40, y).lineTo(560, y).stroke();
        y += 10;

        doc.font('Helvetica-Bold');
        doc.text('Item', 40, y);
        doc.text('Qty', 280, y, { width: 50, align: 'right' });
        doc.text('Rate', 360, y, { width: 70, align: 'right' });
        doc.text('Amount', 460, y, { width: 80, align: 'right' });

        doc.font('Helvetica');
        for (const it of inv.items) {
            y += 18;
            doc.text(it.description, 40, y, { width: 220 });
            doc.text(it.quantity, 280, y, { width: 50, align: 'right' });
            doc.text(it.rate, 360, y, { width: 70, align: 'right' });
            doc.text(it.amount, 460, y, { width: 80, align: 'right' });
        }

        y += 25;
        doc.text(`Subtotal: ${inv.subtotal}`, 400, y);
        y += 15;
        doc.text(`GST: ${inv.gst_amount}`, 400, y);
        y += 20;
        doc.font('Helvetica-Bold').text(`Total: ${inv.total_amount}`, 400, y);

        doc.end();

    } catch (err) {
        console.error('❌ PDF error:', err);
        res.status(500).json({ success: false, message: 'PDF generation failed' });
    }
});


/* ---------------------- SHOP INFO ---------------------- */
router.post('/shop-info', authMiddleware, async (req, res) => {
    const { shop_name, shop_address, gst_no, gst_rate } = req.body;
    const userId = req.user.id;

    await pool.query(`
      INSERT INTO settings (user_id,shop_name,shop_address,gst_no,gst_rate)
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (user_id)
      DO UPDATE SET
        shop_name=EXCLUDED.shop_name,
        shop_address=EXCLUDED.shop_address,
        gst_no=EXCLUDED.gst_no,
        gst_rate=EXCLUDED.gst_rate
    `, [userId, shop_name, shop_address, gst_no, gst_rate]);

    res.json({ success: true });
});

router.get('/shop-info', authMiddleware, async (req, res) => {
    const { rows } = await pool.query(
        `SELECT shop_name,shop_address,gst_no,gst_rate FROM settings WHERE user_id=$1`,
        [req.user.id]
    );
    res.json({ success: true, settings: rows[0] || {} });
});

module.exports = router;