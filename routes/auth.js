// routes/auth.js
console.log("🔍 DB import check:", typeof pool, typeof pool.query);
const express = require("express");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const pool = require("../db");

const router = express.Router();

// ---------------- REGISTER ----------------
router.post("/register", async (req, res) => {
    try {
        const { name, email, password } = req.body;
        if (!name || !email || !password)
            return res.status(400).json({ error: "All fields required" });

        const existing = await pool.query("SELECT id FROM users WHERE email=$1", [email]);
        if (existing.rowCount > 0)
            return res.status(400).json({ error: "Email already registered" });

        const password_hash = await bcrypt.hash(password, 12);
        await pool.query(
            "INSERT INTO users (name, email, password_hash) VALUES ($1,$2,$3)",
            [name, email, password_hash]
        );

        return res.json({ message: "Account created. You can now log in." });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Server error" });
    }
});

// ---------------- LOGIN ----------------
router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password)
            return res.status(400).json({ error: "All fields required" });

        const result = await pool.query(
            "SELECT id, name, email, password_hash FROM users WHERE email=$1",
            [email]
        );

        if (result.rowCount === 0) {
            return res.status(400).json({ error: "Invalid credentials" });
        }

        const user = result.rows[0];
        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) {
            return res.status(400).json({ error: "Invalid credentials" });
        }

        // ✅ generate JWT
        const token = jwt.sign(
            { id: user.id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: "1d" }
        );

        return res.json({
            message: "Login successful",
            user: { id: user.id, name: user.name, email: user.email },
            token
        });
    } catch (err) {
        console.error("Login error:", err);
        res.status(500).json({ error: "Server error" });
    }
});

// ---------------- FORGOT PASSWORD ----------------
router.post("/forgot-password", async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: "Email required" });

        const result = await pool.query("SELECT id FROM users WHERE email=$1", [email]);
        if (result.rowCount === 0) {
            return res.json({ message: "If account exists, reset link will be shown here." });
        }

        const reset_token = crypto.randomBytes(20).toString("hex");
        const expires = new Date(Date.now() + 1000 * 60 * 15); // 15 min

        await pool.query(
            "UPDATE users SET reset_token=$1, reset_token_expires=$2 WHERE email=$3",
            [reset_token, expires, email]
        );

        const baseUrl = process.env.BASE_URL || `https://${req.get("host")}`;
        const resetLink = `${baseUrl}/reset.html?token=${reset_token}&email=${encodeURIComponent(email)}`;

        return res.json({
            message: "Password reset link generated (demo mode).",
            resetLink,
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Server error" });
    }
});

// ---------------- RESET PASSWORD ----------------
router.post("/reset-password", async (req, res) => {
    try {
        const { email, token, newPassword } = req.body;
        if (!email || !token || !newPassword)
            return res.status(400).json({ error: "All fields required" });

        const result = await pool.query(
            "SELECT id, reset_token_expires FROM users WHERE email=$1 AND reset_token=$2",
            [email, token]
        );

        if (result.rowCount === 0)
            return res.status(400).json({ error: "Invalid token or email" });

        const user = result.rows[0];
        if (new Date(user.reset_token_expires) < new Date())
            return res.status(400).json({ error: "Reset token expired" });

        const password_hash = await bcrypt.hash(newPassword, 12);
        await pool.query(
            "UPDATE users SET password_hash=$1, reset_token=NULL, reset_token_expires=NULL WHERE id=$2",
            [password_hash, user.id]
        );

        return res.json({ message: "Password reset successful. You can log in now." });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Server error" });
    }
});

module.exports = router;
