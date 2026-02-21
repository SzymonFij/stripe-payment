CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    payment_status VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE TABLE payments (
    id SERIAL PRIMARY KEY,
    stripe_payment_id VARCHAR(255) UNIQUE NOT NULL,
    user_id INTEGER REFERENCES users(id),
    amount INTEGER NOT NULL,
    currency VARCHAR(10),
    payment_status VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW()
);