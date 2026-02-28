require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const cors = require('cors');
const Stripe = require('stripe');
const pool = require('./db');
const adminRoutes = require('./routes/admin.routes.js');
const salesRoutes = require('./routes/sales.routes.js');
const usersRoutes = require('./routes/users.routes.js');
const authRoutes = require('./routes/auth.routes.js');
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
		return res.status(400).send(`Webhook Error: ${err.message}`);
	}


	switch (event.type) {
		case 'payment_intent.succeeded':
			console.log("Payment succeeded:", event.data.object.id);
			await handlePaymentIntentSucceeded(event.data.object);

			break;
		case 'payment_intent.payment_failed':
			console.log("Payment failed:", event.data.object.id);
			break;
		case "checkout.session.completed":
			console.log("checkout session completed");
			await handleCheckoutCompleted(event.data.object, stripe);
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
	await pool.query('DROP TABLE IF EXISTS subscriptions CASCADE');
    // await pool.query(`
	// 	CREATE TABLE IF NOT EXISTS users (
	// 		id SERIAL PRIMARY KEY,
	// 		email VARCHAR(255) UNIQUE NOT NULL,
	// 		password_hash VARCHAR(255) NOT NULL,
	// 		role VARCHAR(50) DEFAULT 'client',
	// 		payment_status VARCHAR(50),
	// 		created_at TIMESTAMP DEFAULT NOW()
	// 	);
    // `);
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
			email TEXT UNIQUE NOT NULL,
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

// app.use('/auth', authRoutes);
// app.use('/admin', adminRoutes);
app.use('/sales', salesRoutes);
app.use('/users', usersRoutes);

app.post('/create-payment-intent', async (req, res) => {
	const amount = 200;
	const currency = 'pln';
	// First add user to database, later it should be done on launching the quiz
	const token = req.query.token;
	// Token verification
	const tokenResult = await pool.query(
		`SELECT * FROM payment_links WHERE token=$1 AND used=FALSE AND expires_at > NOW()`,
		[token]
	);
	if (tokenResult.rowCount === 0) {
		return res.status(400).json({ error: "Link has expired or has been used already "});
	}

	const linkData = tokenResult.rows[0];
	const email = linkData.email;

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

app.listen(process.env.PORT, () => {
    console.log(`Serwer działa na porcie ${process.env.PORT}`);
});