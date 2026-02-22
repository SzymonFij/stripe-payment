const express = require('express');
const pool = require('../db.js');

const router = express.Router();

router.post('/auth/register', async (req, res) => {
	try {
		const { email, password } = req.body;
		if (!email || !password) {
			return res.status(400).json({ error: "Email and password are obligatory"});
		}
		
		//Hashing the password
		const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
		// Save to database
		const result = await pool.query(
			`INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email`,
			[email, password_hash]
		);
		
		const user = result.rows[0];
		console.log("USER REGISTERED", user);
		
		const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, {expiresIn: '7d' });
		
		res.json({ user, token });
	} catch (error) {
		if (error.code === "23505") { // Unique email
			return res.status(400).json({ error: "Email is taken"});
		}
		console.error(error);
		res.status(500).json({ error: error.message });
	}
})

router.post ('/auth/login', async (req, res) => {
	try {
		const {email, password} = req.body;
		if (!email || !password) {
			return res.status(400).json({ error: "Email and password are obligatory"});
		}
		// Get user from database
		const result = await pool.query(
			`SELECT id, email, password_hash FROM users WHERE email=$1`,
			[email]
		);

		if (result.rowCount === 0) {
			return res.status(400).json({ error: "Invalid email or password"});
		}

		const user = result.rows[0];

		// Password comparison
		const isValid = await bcrypt.compare(password, user.password_hash);
		if (!isValid) {
			return res.status(400).json({ error: "Invalid email or password"});
		}

		// JWT token
		const token = jwt.sign({ userId: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
		res.json({ user: {id: user.id, email: user.email}, token });
	} catch (error) {
		console.error(error);
		res.status(500).json({ error: error.message });
	}
})

module.exports = router;