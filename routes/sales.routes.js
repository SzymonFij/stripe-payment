const express = require('express');
const crypto = require('crypto');
const pool = require('../db.js');
const authenticate = require('../middleware/auth.middleware.js');
const authorize = require('../middleware/role.middleware.js');
const ROLES = require('../src/constants/roles.js');

const router = express.Router();
/** POST /sales/generate-payment-link
 * Access to: sales, superadmin
 */
router.post(
    '/generate-payment-link',
    authenticate,
    authorize(ROLES.SALES, ROLES.SUPERADMIN),
    async (req, res) => {
        try {
		    const { userId } = req.body; // Consider sending email and checking userId from database.

            if (!userId) {
                return res.status(400).json({ error: "No userId"});
            }
            // Generate random token
            const token = crypto.randomBytes(32).toString('hex');
            // Set expiration time for 1 day
            const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
            // Save token in database
            await pool.query(
                `INSERT INTO payment_links (user_id, token, expires_at) VALUES ($1, $2, $3)`,
                [userId, token, expiresAt]
            );
            // Generate link for frontend
            const link = `${process.env.FRONTEND_URL}/platnosc?token=${token}`;
            res.json({ link, expiresAt });
        } catch (error) {
            console.error(error);
            res.send(500).json({ error: error.message });
        }
    }
);

router.post(
    '/renew-payment-link',
    authenticate,
    authorize(ROLES.SALES, ROLES.SUPERADMIN),
    async (req, res) => {
        try {
            const { token } = req.body;

            const result = await pool.query(
                `SELECT * FROM payment_links WHERE token=$1`,
                [token]
            );
            if (result.rowCount === 0) {
                return res.status(400).json({ error: "No link was found"});

            }
            const oldLink = result.rows[0];
            const newToken = crypto.randomBytes(32).toString('hex');
            const newExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

            await pool.query(
                `UPDATE payment_links SET token=$1, expires_at=$2, used=FALSE WHERE id=$3`,
                [newToken, newExpires, oldLink.id]
            );

            const newLink = `${process.env.FRONTEND_URL}/platnosc?token=${newToken}`;
            res.json({ link: newLink, expiresAt: newExpires });
        } catch (error) {
            console.error(error)
            res.status(500).json({ error: error.message });
        }
    }
);

module.exports = router;