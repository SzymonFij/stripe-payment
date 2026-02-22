const bcrypt = require('bcrypt');
const pool = require('../db.js');
const ROLES = require('../src/constants/roles.js');

export const ensureSuperAdminExists = async () => {
    const result = await pool.query(
        `SELECT * FROM users WHERE role=$1 LIMIT 1`,
        [ROLES.SUPERADMIN]
    );

    if (result.rowCount === 0) {
        const hashedPassword = await bcrypt.hash(
            process.env.SUPERADMIN_PASSWORD,
            10
        );

        await pool.query(
            `INSERT INTO users (email, password_hash, role)
            VALUES ($1, $2, $3)`,
            [
                process.env.SUPERADMIN_EMAIL,
                hashedPassword,
                ROLES.SUPERADMIN
            ]
        );

        console.log("Superadmin has been created");
    }
}