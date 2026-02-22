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
router.post(
    '/users/:id/payment-status',
    authenticate,
    authorize(ROLES.SALES, ROLES.SUPERADMIN),
    async (req, res) => {
        const userId = req.params.id;

        try {
            const result = await pool.query(
                `SELECT payment_status FROM payments WHERE user_id =$1`,
                [userId]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ error: "User not found" });
            }

            res.json({ status: result.rows[0].payment_status });
        } catch (error) {
            res.status(500).json({ error: "Database error"});
        }
    }
);

module.exports = router;