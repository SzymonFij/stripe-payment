require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Stripe = require('stripe');
const pool = require('./db');

const app = express();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

app.use(cors({
  	origin: process.env.FRONTEND_URL
}));

app.post('/webhook', express.raw({type: 'application/json'}), async (req, res) => {
	const sig = req.headers['stripe-signature'];
	let event;

	try {
		event = stripe.webhooks.constructEvent(
		req.body,
		sig,
		process.env.STRIPE_WEBHOOK_SECRET
		);
	} catch (err) {
		console.log("error received", err.message);
		return res.status(400).send(`Webhook Error: ${err.message}`);
	}

	console.log("Event received:", event.type);

	switch (event.type) {
		case 'payment_intent.succeeded':
			const paymentIntent = event.data.object;
			console.log("Payment succeeded:", paymentIntent.id);
			
			const userId = paymentIntent.metadata.userId;
			try {
				await pool.query(
					`INSERT INTO payments
					(stripe_payment_id, user_id, amount, currency, status)
					VALUES ($1, $2, $3, $4, $5)`,
					[
						paymentIntent.id,
						userId,
						paymentIntent.amount,
						paymentIntent.currency,
						paymentIntent.status
					]
				);
				await pool.query(
					`UPDATE users SET payment_status = 'paid' WHERE id = $1`,
					[userId]
				);
				console.log("Payment has been saved");
			} catch (error) {
				console.error("DB error:", error);
			}

			break;
		case 'payment_intent.payment_failed':
			console.log("Payment failed:", event.data.object.id);
			break;
		default:
			console.log("Unhandled event:", event.type);
	}

  	res.json({ received: true });
  
});

app.get("/init-db", async (req, res) => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
		payment_status VARCHAR(50),
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    res.send("Table created");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error");
  }
});
app.get("/init-db2", async (req, res) => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS payments (
		id SERIAL PRIMARY KEY,
		stripe_payment_id VARCHAR(255) UNIQUE NOT NULL,
		user_id INTEGER REFERENCES users(id),
		amount INTEGER NOT NULL,
		currency VARCHAR(10),
		payment_status VARCHAR(50),
		created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    res.send("Table created");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error");
  }
});

app.use(express.json());

app.post('/create-payment-intent', async (req, res) => {
	// First add user to database, later it should be done on launching the quiz
	const email = req.body.email;
	const amount = 200;
	const currency = 'pln';
	console.log("EMAIL", email, req.body);
	const result = await pool.query(
		`INSERT INTO users (email)
		VALUES ($1)
		ON CONFLICT (email)
		DO UPDATE SET email = EXCLUDED.email
		RETURNING id`,
		[email]
	);
	const userId = result.rows[0].id;
	console.log("User ID", userId);

	// Make payment to stripe 
    try {
        const paymentIntent = await stripe.paymentIntents.create({
			amount: amount, // 2.00 zł
			currency: currency,
			automatic_payment_methods: {
				enabled: true,
        	},
			metadata: {
				userId: userId
			}
        });

		// Send payment status to payments database
		await pool.query(
			`UPDATE users SET payment_status = 'create=payment-intent' WHERE id = $1`,
			[paymentIntent.id, userId, amount, currency, paymentIntent.status]
		);
        res.send({
        	clientSecret: paymentIntent.client_secret,
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get("/user/:id/payment-status", async (req, res) => {
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
})

app.get("/users", async (req, res) => {
	try {
		const result = await pool.query("SELECT * FROM users");
		res.json(result.rows);
	} catch (error) {
		console.error(error);
		res.status(500).send("Error fething users");
	}
});

// for test only
app.get("/payments", async (req, res) => {
	try {
		const result = await pool.query("SELECT * FROM payments");
		res.json(result.rows);
	} catch (error) {
		console.error(error);
		res.status(500).send("Error fetching payments");
	}
})

app.listen(process.env.PORT, () => {
    console.log(`Serwer działa na porcie ${process.env.PORT}`);
});