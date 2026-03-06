const pool = require('../../db');

const handlePaymentIntentSucceeded = async (paymentIntent) => {
    const email = paymentIntent.receipt_email || paymentIntent.metadata.email;
    const paymentType = paymentIntent.metadata.paymentType;
    console.log("Payment succeeded:", paymentIntent.id);
    console.log("PAYMENT TO BE PROLONGED BY:", paymentType);

    if (!email) {
        return;
    }

    const interval = paymentType === "yearly" ? '1 year' : '1 month';

    await pool.query(
        `INSERT INTO payments (
            email,
            stripe_payment_intent_id,
            stripe_customer_id,
            type,
            status,
            amount,
            currency,
            paid_at,
            period_end
        )
        VALUES ($1,$2,$3,'one_time','succeeded',$4,$5,NOW(),NOW() + INTERVAL '${interval}')`,
        [
            email,
            paymentIntent.id,
            paymentIntent.customer,
            paymentIntent.amount,
            paymentIntent.currency
        ]
    );

    
    await pool.query(
        `INSERT INTO subscriptions (
            email,
            source,
            status,
            current_period_start,
            current_period_end,
            stripe_subscription_id,
            stripe_customer_id
        )
        VALUES ($1,$2,$3,
            NOW(),
            NOW() + INTERVAL '${interval}',
            $4,
            $5
        )
        ON CONFLICT (stripe_subscription_id)
        DO UPDATE SET
            current_period_end = GREATEST(subscriptions.current_period_end, NOW()) + INTERVAL '${interval}',
            updated_at = now()`,
        [
            email,
            'one_time',
            'active',
            email, // using email as a dummy subscription id for one-time payments
            email  // using email as a dummy customer id for one-time payments
        ]
    );
}

const handleCheckoutCompleted = async (session, stripe) => {
    if (session.mode !== "subscription") {
        return;
    }
    if (session.payment_status !== "paid") {
        return;
    }

    const email = session.customer_details.email || session.customer_email;
    const subscriptionId = session.subscription;
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);

    await pool.query(
        `INSERT INTO subscriptions (
            email,
            stripe_subscription_id,
            stripe_customer_id,
            source,
            status,
            current_period_start,
            current_period_end,
            cancel_at_period_end
        )
        VALUES ($1,$2,$3,$4,$5,
            to_timestamp($6),
            to_timestamp($7),
            $8
        )
        ON CONFLICT (stripe_subscription_id)
        DO UPDATE SET
            status = EXCLUDED.status,
            current_period_start = EXCLUDED.current_period_start,
            current_period_end = EXCLUDED.current_period_end,
            cancel_at_period_end = EXCLUDED.cancel_at_period_end,
            updated_at = now()`,
        [
            email,
            subscription.id,
            subscription.customer,
            'stripe_subscription',
            subscription.status,
            subscription.current_period_start,
            subscription.current_period_end,
            subscription.cancel_at_period_end,
        ]
    );
}

const handleInvoicePaid = async (invoice) => {
    console.log("HANDLE INVOICE PAID", invoice.id, "subscription:", invoice.subscription, "customer email:", invoice.customer_email);
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