require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Stripe = require('stripe');

const app = express();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

app.use(cors({
  origin: process.env.FRONTEND_URL
}));
app.use(express.json());

app.post('/create-payment-intent', async (req, res) => {
    try {
        console.log("Body:", req.body);

        const paymentIntent = await stripe.paymentIntents.create({
        amount: 200, // 2.00 zł
        currency: 'pln',
        automatic_payment_methods: {
            enabled: true,
        },
        });

        res.send({
        clientSecret: paymentIntent.client_secret,
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(process.env.PORT, () => {
    console.log(`Serwer działa na porcie ${process.env.PORT}`);
});

app.post('/webhook', express.raw({type: 'application/json'}), (req, res) => {
  const sig = req.headers['stripe-signature'];

  try {
    const event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );

    switch (event.type) {
      case 'payment_intent.succeeded':
        const paymentIntent = event.data.object;
        console.log("Payment succeeded:", paymentIntent.id);
        // Save to database / unlock service, etc.
        break;
      case 'payment_intent.payment_failed':
        console.log("Payment failed:", event.data.object.id);
        break;
      default:
        console.log("Unhandled event:", event.type);
    }

    res.json({ received: true });
  } catch (err) {
    console.log("error received", err.message);
    res.status(400).send(`Webhook Error: ${err.message}`);
  }
});