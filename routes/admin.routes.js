const express = require('express');
const crypto = require('crypto');
const pool = require('../db.js');
const bcrypt = require('bcrypt');
const { authenticate } = require('../middleware/auth.middleware.js');
const { authorize } = require('../middleware/role.middleware.js');
const { ROLES } = require('../src/constants/roles.js');

const router = express.Router();
/** POST /admin/create-sales
 * Access to: superadmin
 */
// router.post(
//     '/create-sales',
//     authenticate,
//     authorize(ROLES.SUPERADMIN),
//     async (req, res) => {
//         const { email, password } = req.body;

//         const hash = await bcrypt.hash(password, 10);

//         const result = await pool.query(
//             `INSERT INTO users (email, password_hash, role)
//             VALUES ($1, $2, $3)
//             RETURNING id,email,role`,
//             [email, hash, ROLES.SALES]
//         );

//         res.json(result.rows[0]);
//     }
// );

router.get("/users",
	// authenticate, authorize(ROLES.SUPERADMIN),
	async (req, res) => {
	try {
		const result = await pool.query("SELECT * FROM users");
		res.json(result.rows);
	} catch (error) {
		console.error(error);
		res.status(500).send("Error fething users");
	}
});

router.get("/payments",
	// authenticate, authorize(ROLES.SUPERADMIN),
	async (req, res) => {
	try {
		const result = await pool.query("SELECT * FROM payments");
		res.json(result.rows);
	} catch (error) {
		console.error(error);
		res.status(500).send("Error fetching payments");
	}
});

router.get("/tokens",
	// authenticate, authorize(ROLES.SUPERADMIN),
	async (req, res) => {
	try {
		const result = await pool.query("SELECT * FROM payment_links");
		res.json(result.rows);
	} catch (error) {
		console.error(error);
		res.status(500).send("Error fetching payment_links");
	}
});

router.get("/subscriptions",
	// authenticate, authorize(ROLES.SUPERADMIN),
	async (req, res) => {
	try {
		const result = await pool.query("SELECT * FROM subscriptions");
		res.json(result.rows);
	} catch (error) {
		console.error(error);
		res.status(500).send("Error fetching subscriptions");
	}
})

module.exports = router;