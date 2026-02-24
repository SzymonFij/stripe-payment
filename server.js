require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const cors = require('cors');
const Stripe = require('stripe');
const pool = require('./db');
// const { authenticate } = require('./middleware/auth.middleware.js');
const adminRoutes = require('./routes/admin.routes.js');
const salesRoutes = require('./routes/sales.routes.js');
const usersRoutes = require('./routes/users.routes.js');
const authRoutes = require('./routes/auth.routes.js');
// const { ROLES } = require('./src/constants/roles.js');
// const { ensureSuperAdminExists } = require('./bootstrap/admin.bootstrap.js');
const {
	handlePaymentIntentSucceeded,
	handleCheckoutCompleted,
	handleInvoicePaid,
	handleSubscriptionUpdated,
	handleSubscriptionDeleted,
} = require('./src/handlers/payments.js');

const app = express();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const JWT_SECRET = process.env.JWT_SECRET || "supertajnehaslo";
const SALT_ROUNDS = 10; // Rounds to hash password;

app.use(cors({
  	origin: process.env.FRONTEND_URL
}));
// ensureSuperAdminExists(); // If SuperAdmin role does not exist - create with ENV parameters.

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
			console.log("Payment succeeded:", event.dada.object.id);
			await handlePaymentIntentSucceeded(event.data.object);
			// const paymentIntent = event.data.object;
			
			// const userId = paymentIntent.metadata.userId;
			// try {
			// 	await pool.query(
			// 		`INSERT INTO payments
			// 		(stripe_payment_id, user_id, amount, currency, payment_status)
			// 		VALUES ($1, $2, $3, $4, $5)`,
			// 		[
			// 			paymentIntent.id,
			// 			userId,
			// 			paymentIntent.amount,
			// 			paymentIntent.currency,
			// 			paymentIntent.status
			// 		]
			// 	);
			// 	await pool.query(
			// 		`UPDATE users SET payment_status = 'paid' WHERE id = $1`,
			// 		[userId]
			// 	);
			// 	console.log("Payment has been saved");
			// } catch (error) {
			// 	console.error("DB error:", error);
			// }

			break;
		case 'payment_intent.payment_failed':
			console.log("Payment failed:", event.data.object.id);
			break;
		case "checkout.session.completed":
			console.log("checkout session completed");
			await handleCheckoutCompleted(event.data.object, stripe);
			// const session = event.data.object;
			// if (session.mode === "subscription") {
			// 	// activate subscription for user
			// }
			break;
		case "invoice.paid":
			// Renew supscription
			console.log("invoice paid");
			handleInvoicePaid(event.data.object);
			break;
		case "customer.subscription.created":
			console.log("subscription created");
			// Start subscription is handled in "checkout.session.completed"
			break;
		case "customer.subscription.updated":
			// State change of customer's subscription
			console.log("subscription updated");
			await handleSubscriptionUpdated(event.data.object);
			break;
		case "customer.subscription.deleted":
			// Cancel subscription
			console.log("subscription deleted");
			await handleSubscriptionDeleted(event.data.object);
			break;
		default:
			console.log("Unhandled event:", event.type);
	}
  	res.json({ received: true });
});

app.get("/init-db", async (req, res) => {
  try {
	await pool.query('DROP TABLE IF EXISTS payments CASCADE;');
	await pool.query('DROP TABLE IF EXISTS users CASCADE');
	await pool.query('DROP TABLE IF EXISTS payment_links');
    await pool.query(`
		CREATE TABLE IF NOT EXISTS users (
			id SERIAL PRIMARY KEY,
			email VARCHAR(255) UNIQUE NOT NULL,
			password_hash VARCHAR(255) NOT NULL,
			role VARCHAR(50) DEFAULT 'client',
			payment_status VARCHAR(50),
			created_at TIMESTAMP DEFAULT NOW()
		);
    `);
	// Commented code should be run only once
	// CREATE TYPE payment_type AS ENUM ('one_time', 'subscription');
	// 	CREATE TYPE payment_status AS ENUM (
	// 		'pending',
	// 		'succeeded',
	// 		'failed',
	// 		'canceled',
	// 		'refunded'
	// 	);
    await pool.query(`
		CREATE TABLE IF NOT EXISTS payments (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

			email TEXT NOT NULL,
			
			stripe_payment_intent_id TEXT,
			stripe_invoice_id TEXT,
			stripe_subscription_id TEXT,
			stripe_customer_id TEXT,

			type payment_type NOT NULL,
			status payment_status NOT NULL,

			amount INTEGER NOT NULL,
			currency VARCHAR(10),

			period_start TIMESTAMP WITH TIME ZONE,
			period_end TIMESTAMP WITH TIME ZONE,

			created_at TIMESTAMP DEFAULT NOW()
		);
    `);
	await pool.query(`
		CREATE TABLE IF NOT EXISTS subscriptions (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			
			email TEXT NOT NULL,

			stripe_subscription_id TEXT UNIQUE NOT NULL,
			stripe_customer_id TEXT NOT NULL,

			status TEXT NOT NULL,
			current_period_start TIMESTAMP WITH TIME ZONE,
			current_period_end TIMESTAMP WITH TIME ZONE,

			cancel_at_period_end BOOLEAN DEFAULT false,

			created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
			updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
		)`)
	await pool.query(`
		CREATE TABLE payment_links (
			id SERIAL PRIMARY KEY,
			email TEXT NOT NULL,
			token VARCHAR(255) UNIQUE NOT NULL,
			expires_at TIMESTAMP NOT NULL,
			used BOOLEAN DEFAULT FALSE,
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

app.use('/auth', authRoutes);

// app.post('/auth/register', async (req, res) => {
// 	try {
// 		const { email, password } = req.body;
// 		if (!email || !password) {
// 			return res.status(400).json({ error: "Email and password are obligatory"});
// 		}
		
// 		//Hashing the password
// 		const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
// 		// Save to database
// 		const result = await pool.query(
// 			`INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email`,
// 			[email, password_hash]
// 		);
		
// 		const user = result.rows[0];
// 		console.log("USER REGISTERED", user);
		
// 		const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, {expiresIn: '7d' });
		
// 		res.json({ user, token });
// 	} catch (error) {
// 		if (error.code === "23505") { // Unique email
// 			return res.status(400).json({ error: "Email is taken"});
// 		}
// 		console.error(error);
// 		res.status(500).json({ error: error.message });
// 	}
// })

// app.post ('/auth/login', async (req, res) => {
// 	try {
// 		const {email, password} = req.body;
// 		if (!email || !password) {
// 			return res.status(400).json({ error: "Email and password are obligatory"});
// 		}
// 		// Get user from database
// 		const result = await pool.query(
// 			`SELECT id, email, password_hash FROM users WHERE email=$1`,
// 			[email]
// 		);

// 		if (result.rowCount === 0) {
// 			return res.status(400).json({ error: "Invalid email or password"});
// 		}

// 		const user = result.rows[0];

// 		// Password comparison
// 		const isValid = await bcrypt.compare(password, user.password_hash);
// 		if (!isValid) {
// 			return res.status(400).json({ error: "Invalid email or password"});
// 		}

// 		// JWT token
// 		const token = jwt.sign({ userId: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
// 		res.json({ user: {id: user.id, email: user.email}, token });
// 	} catch (error) {
// 		console.error(error);
// 		res.status(500).json({ error: error.message });
// 	}
// })

app.use('/admin', adminRoutes);
app.use('/sales', salesRoutes);
app.use('/users', usersRoutes);

// app.post('/sales/generate-payment-link', async (req, res) => {
// 	try {
// 		const { userId } = req.body; // Consider sending email and checking userId from database.

// 		if (!userId) {
// 			return res.status(400).json({ error: "No userId"});
// 		}
// 		// Generate random token
// 		const token = crypto.randomBytes(32).toString('hex');
// 		// Set expiration time for 1 day
// 		const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
// 		// Save token in database
// 		await pool.query(
// 			`INSERT INTO payment_links (user_id, token, expires_at) VALUES ($1, $2, $3)`,
// 			[userId, token, expiresAt]
// 		);
// 		// Generate link for frontend
// 		const link = `http://localhost:4173/platnosc?token=${token}`;
// 		res.json({ link, expiresAt });
// 	} catch (error) {
// 		console.error(error);
// 		res.send(500).json({ error: error.message });
// 	}
// })

app.post('/create-payment-intent', async (req, res) => {
	const amount = 200;
	const currency = 'pln';
	// First add user to database, later it should be done on launching the quiz
	const token = req.query.token;
	console.log("TOKEN", token, req.params,);
	// Token verification
	const tokenResult = await pool.query(
		`SELECT * FROM payment_links WHERE token=$1 AND used=FALSE AND expires_at > NOW()`,
		[token]
	);
	// console.log("TOKEN RESULTS", tokenResult);
	if (tokenResult.rowCount === 0) {
		return res.status(400).json({ error: "Link has expired or has been used already "});
	}

	const linkData = tokenResult.rows[0];
	// console.log("link data reading", linkData);
	console.log("TOKEN RESULT", tokenResult);
	const email = linkData.email;
	console.log("link data", linkData, "userID", email);

	// TODO: Delete before production. This is temporary user addition.
	// const result = await pool.query(
	// 	`INSERT INTO users (email)
	// 	VALUES ($1)
	// 	ON CONFLICT (email)
	// 	DO UPDATE SET email = EXCLUDED.email
	// 	RETURNING id`,
	// 	[email]
	// );
	// const userId = result.rows[0].id;
	console.log("email", email);

	// Make payment to stripe 
    try {
        const paymentIntent = await stripe.paymentIntents.create({
			amount: amount, // 2.00 zł
			currency: currency,
			automatic_payment_methods: {
				enabled: true,
        	},
			metadata: {
				email: email
			}
        });

		// Send payment status to payments database
		// await pool.query(
		// 	`UPDATE users SET payment_status = 'create-payment-intent' WHERE id = $1`,
		// 	[userId]
		// );
		// Set token as USED
		await pool.query(
			`UPDATE payment_links SET used=TRUE WHERE id=$1`,
			[linkData.id]
		);
        res.send({
        	clientSecret: paymentIntent.client_secret,
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post("/create-subscription-session", async (req, res) => {
	try {
		const { email } = req.body;
		const session = await stripe.checkout.sessions.create({
			mode: "subscription",
			payment_method_types: ["card"],
			customer_email: email,
			line_items: [
				{
					price: "price_1T4O29IqG0lEuV8tdc9xMixW",
					quantity: 1,
				},
			],
			success_url: `${process.env.FRONTEND_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
			cancel_url: `${process.env.FRONTEND_URL}/cancel`,
		});

		res.json({ url: session.url });
	} catch (error) {
		console.error(error);
		res.status(500).json({ error: error.message });
	}
});

app.post("/cancel-subscription", async (req, res) => {
	try {
		const { email } = req.body;
		
		const subscription = await pool.query(
			`SELECT * FROM subscriptions WHERE email=$1`,
			[email]
		);
		if (!subscription.rows.length) {
			return res.status(404).json({ error: `Subscription for user ${email} not found`});
		}

		const subscriptionId = subscription.rows[0].stripe_subscription_id;
		console.log("Subscription id", subscriptionId);
		// console.log("TOKEN RESULTS", tokenResult);
		await stripe.subscriptions.update(subscriptionId, {
			cancel_at_period_end: true,
		});
		
		res.json({ success: true });
	} catch (error) {
		console.error(error);
		res.status(500).json({ error: error.message });
	}
});

app.post("/create-portal-session", async (req, res) => {
	const { email } = req.body;

	const subscription = await pool.query(
		`SELECT stripe_customer_id FROM subscriptions WHERE email=$1`,
		[email]
	);

	if (!subscription.rows.length) {
		return res.status(404).json({ error: `Subscription for user ${email} not found` });
	}

	const portalSession = await stripe.billingPortal.sessions.create({
		customer: subscription.rows[0].stripe_customer_id,
		return_url: process.env.FRONTEND_URL,
	});
	res.json({ url: portalSession.url });
});

// Renewing the payment link
// app.post('/sales/renew-payment-link', async (req, res) => {
// 	try {
// 		const { token } = req.body;

// 		const result = await pool.query(
// 			`SELECT * FROM payment_links WHERE token=$1`,
// 			[token]
// 		);
// 		if (result.rowCount === 0) {
// 			return res.status(400).json({ error: "No link was found"});

// 		}
// 		const oldLink = result.rows[0];
// 		const newToken = crypto.randomBytes(32).toString('hex');
// 		const newExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

// 		await pool.query(
// 			`UPDATE payment_links SET token=$1, expires_at=$2, used=FALSE WHERE id=$3`,
// 			[newToken, newExpires, oldLink.id]
// 		);

// 		const newLink = `http://localhost:4173/platnosc?token=${newToken}`;
// 		res.json({ link: newLink, expiresAt: newExpires });
// 	} catch (error) {
// 		console.error(error)
// 		res.status(500).json({ error: error.message });
// 	}
// })

// app.get("/user/:id/payment-status", authenticate, authorize(ROLES.SALES, ROLES.SUPERADMIN), async (req, res) => {
// 	const userId = req.params.id;

// 	try {
// 		const result = await pool.query(
// 			`SELECT payment_status FROM payments WHERE user_id =$1`,
// 			[userId]
// 		);

// 		if (result.rows.length === 0) {
// 			return res.status(404).json({ error: "User not found" });
// 		}

// 		res.json({ status: result.rows[0].payment_status });
// 	} catch (error) {
// 		res.status(500).json({ error: "Database error"});
// 	}
// })

// app.get("/users", authenticate, authorize(ROLES.SUPERADMIN), async (req, res) => {
// 	try {
// 		const result = await pool.query("SELECT * FROM users");
// 		res.json(result.rows);
// 	} catch (error) {
// 		console.error(error);
// 		res.status(500).send("Error fething users");
// 	}
// });

// for test only
// app.get("/payments", authenticate, authorize(ROLES.SUPERADMIN), async (req, res) => {
// 	try {
// 		const result = await pool.query("SELECT * FROM payments");
// 		res.json(result.rows);
// 	} catch (error) {
// 		console.error(error);
// 		res.status(500).send("Error fetching payments");
// 	}
// });

// app.get("/tokens", authenticate, authorize(ROLES.SUPERADMIN), async (req, res) => {
// 	try {
// 		const result = await pool.query("SELECT * FROM payment_links");
// 		res.json(result.rows);
// 	} catch (error) {
// 		console.error(error);
// 		res.status(500).send("Error fetching payment_links");
// 	}
// })

app.listen(process.env.PORT, () => {
    console.log(`Serwer działa na porcie ${process.env.PORT}`);
});