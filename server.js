require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Stripe = require('stripe');

const app = express();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

app.use(cors());
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

    if (event.type === 'payment_intent.succeeded') {
      console.log('Płatność zakończona sukcesem!');
      // Tu możesz zapisać klienta do bazy
    }

    res.json({ received: true });
  } catch (err) {
    res.status(400).send(`Webhook Error: ${err.message}`);
  }
});