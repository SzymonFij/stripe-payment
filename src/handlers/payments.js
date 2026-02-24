const pool = require('../../db');

const handlePaymentIntentSucceeded = async (paymentIntent) => {
    const email = paymentIntent.receipt_email || paymentIntent.metadata.email;
    console.log("Payment succeeded:", paymentIntent.id);

    if (!email) {
        return;
    }

    await pool.query(
        `INSERT INTO payments (
            email,
            stripe_payment_intent_id,
            stripe_customer_id,
            type,
            status,
            amount,
            currency
        )
        VALUES ($1,$2,$3,'one_time','succeeded',$4,$5)`,
        [
            email,
            paymentIntent.id,
            paymentIntent.customer,
            paymentIntent.amount,
            paymentIntent.currency
        ]
    );
}

const handleCheckoutCompleted = async (session, stripe) => {
    if (session.mode !== "subscription") {
        return;
    }

    const email = session.customer_details.email;
    const subscriptionId = session.subscription;
    const subscription = await stripe.subscriptions.retreive(subscriptionId);

    await pool.query(
        `INSERT INTO subscriptions (
            email,
            stripe_subscription_id,
            stripe_customer_id,
            status,
            current_period_start,
            current_period_end,
            cancel_at_period_end
        )
        VALUES ($1,$2,$3,$4,
            to_timestamp($5),
            to_timestamp($6),
            $7
        )
        ON CONFLICT (stripe_subscription_id)
        DO UPDATE SET
            status = EXCLUDED.status,
            current_period_start = EXCLUDED.current_period_start,
            current_period_end = EXCLUDED.current_periond_end,
            cancel_at_period_end = EXCLUDED.cancel_at_period_end,
            updated_at = now()`,
        [
            email,
            subscription.id,
            subscription.customer,
            subscription.status,
            subscription.current_period_start,
            subscription.current_period_end,
            subscription.cancel_at_period_end,
        ]
    );
}

const handleInvoicePaid = async (invoice) => {
    if (!invoice.subscription) {
        return;
    }
    
    const email = invoice.customer_email;
    await pool.query(
        `INSERT INTO payments (
            email,
            stripe_invoice_id,
            stripe_subscription_id,
            stripe_customer_id,
            type,
            status,
            amount,
            currency,
            period_start,
            period_end
        )
        VALUES ($1,$2,$3,$4,
            'subscription',
            'succeeded',
            $5,$6,
            to_timestamp($7),
            to_timestamp($8)
        )`,
        [
            email,
            invoice.id,
            invoice.subscription,
            invoice.customer,
            invoice.amount_paid,
            invoice.currency,
            invoice.lines.data[0].period.start,
            invoice.lines.data[0].period.end,
        ]
    );
}

const handleSubscriptionUpdated = async (subscription) => {
    await pool.query(
        `UPDATE subscriptions
            SET status = $1,
            current_period_start = to_timestamp($2),
            current_period_end = to_timestamp($3),
            cancel_at_period_end = $4,
            updated_at = now()
        WHERE stripe_subscription_id = $5`,
        [
            subscription.status,
            subscription.current_period_start,
            subscription.current_period_end,
            subscription.cancel_at_period_end,
            subscription.id
        ]
    );
}

const handleSubscriptionDeleted = async (subscription) => {
    await pool.query(
        `UPDATE subscriptions
        SET status = 'canceled',
            updated_at = now()
        WHERE stripe_subscription_id = $1`,
        [ subscription.id ]
    );
}

module.exports = {
    handlePaymentIntentSucceeded,
    handleCheckoutCompleted,
    handleInvoicePaid,
    handleSubscriptionUpdated,
    handleSubscriptionDeleted
};