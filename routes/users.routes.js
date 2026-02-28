const express = require('express');
const pool = require('../db.js');

const router = express.Router();
router.get(
    '/payment-status',
    async (req, res) => {
        const { email } = req.query;

        try {
            const result = await pool.query(
                `SELECT status FROM payments WHERE email =$1`,
                [email]
            );

            if (result.rows.length === 0) {
                try {
                    const linkRes = await pool.query(
                        `SELECT * FROM payment_links WHERE email=$1`,
                        [email]
                    );
                    if (linkRes.rows.length === 0) {
                        return res.status(404).json({ error: "No payment link was found"});
                    }
                    if (linkRes.rows[0].used) {
                        res.json({ status: "Payment link used, but payment not found. Generate new link."});
                    }
                    res.json({ status: "Payment link created, waiting for payment.", expires_at: linkRes.rows[0].expires_at});
                } catch {
                    return res.status(404).json({ error: "User not found" });
                }
            }

            res.json({ status: result.rows[0].status });
        } catch (error) {
            res.status(500).json({ error: "Database error"});
        }
    }
);

router.get("/subscription", async (req, res) => {
    const { email } = req.query;

    const result = await pool.query(
        `SELECT *
        FROM subscriptions
        WHERE email = $1
        AND status = 'active'
        AND current_period_end > now()`,
        [email]
    );

    const hasAccess = result.rows.length > 0;
    res.json({ status: hasAccess });
})

module.exports = router;