const express = require('express');
const crypto = require('crypto');
const pool = require('../db.js');
const { authenticate } = require('../middleware/auth.middleware.js');
const { authorize } = require('../middleware/role.middleware.js');
const { ROLES } = require('../src/constants/roles.js');

const router = express.Router();
/** POST /users/:id/payment-status
 * Access to: sales, superadmin
 */
router.get(
    '/payment-status',
    // authenticate,
    // authorize(ROLES.SALES, ROLES.SUPERADMIN),
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
                    res.json({ status: "Payment link created, waiting for payment."});
                } catch {
                    return res.status(404).json({ error: "User not found" });
                }
            }

            console.log("Check if only one payment was created", result.rows);
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