const express = require('express');
const pool = require('../db.js');

const router = express.Router();
router.get(
    '/payment-status',
    async (req, res) => {
        const { email } = req.query;

        try {
            const result = await pool.query(
                `SELECT * FROM payments WHERE email =$1 ORDER BY paid_at DESC LIMIT 1`,
                [email]
            );

            if (result.rows.length === 0) {
                try {
                    const linkRes = await pool.query(
                        `SELECT * FROM payment_links WHERE email=$1`,
                        [email]
                    );
                    if (linkRes.rows.length === 0) {
                        return res.status(404).json({ error: "Nie znaleziono płatności dla tego maila"});
                    }
                    if (linkRes.rows[0].used) {
                        return res.json({ status: "Link płatności został użyty, ale płatność nie została wykonana. Wygeneruj nowy link."});
                    }
                    return res.json({ status: "Link płatności został utworzony, oczekiwanie na płatność.", expires_at: linkRes.rows[0].expires_at});
                } catch {
                    return res.status(404).json({ error: "Nie znaleziono użytkownika" });
                }
            }

            console.log("Check if only one payment was created", result.rows);
            res.json({ status: result.rows[0].status, created_at: result.rows[0].created_at, paid_at: result.rows[0].paid_at });
        } catch (error) {
            res.status(500).json({ error: "Błąd serwera"});
        }
    }
);

router.get("/subscription", async (req, res) => {
    const { email } = req.query;

    if (!email) {
        return res.status(400).json({ error: "Email jest wymagany" });
    }

    const result = await pool.query(
        `SELECT *
        FROM subscriptions
        WHERE email = $1
        AND status = 'active'
        AND current_period_end > now()`,
        [email]
    );

    if (result.rows.length === 0) {
        return res.json({ status: false });
    }

    const subscription = result.rows[0];

    res.json({ status: true,
        subscription: {
            stripe_subscription_id: subscription.stripe_subscription_id,
            stripe_customer_id: subscription.stripe_customer_id,
            source: subscription.source,
            current_period_start: subscription.current_period_start,
            current_period_end: subscription.current_period_end,
            cancel_at_period_end: subscription.cancel_at_period_end,
        }
     });
})

module.exports = router;