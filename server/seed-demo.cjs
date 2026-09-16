require('dotenv').config()

const bcrypt = require('bcryptjs')
const pool = require('./db.cjs')

const demoUsers = [
  { name: 'NOC Administrator', email: 'admin@nocautomation.com', password: 'Admin123!', role: 'Admin' },
  { name: 'NOC Operator', email: 'operator@nocautomation.com', password: 'Operator123!', role: 'Operator' },
  { name: 'NOC Viewer', email: 'viewer@nocautomation.com', password: 'Viewer123!', role: 'Viewer' },
]

async function seed() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role VARCHAR(20) NOT NULL DEFAULT 'Viewer' CHECK (role IN ('Admin', 'Operator', 'Viewer')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  for (const demoUser of demoUsers) {
    const passwordHash = await bcrypt.hash(demoUser.password, 12)
    await pool.query(`
      INSERT INTO users (name, email, password_hash, role)
      VALUES ($1, LOWER($2), $3, $4)
      ON CONFLICT (email) DO UPDATE SET
        name = EXCLUDED.name,
        password_hash = EXCLUDED.password_hash,
        role = EXCLUDED.role,
        updated_at = NOW()
    `, [demoUser.name, demoUser.email, passwordHash, demoUser.role])
    console.log(`Seeded ${demoUser.role}: ${demoUser.email}`)
  }
}

seed().catch(error => { console.error('Unable to seed demo accounts:', error.message); process.exitCode = 1 }).finally(() => pool.end())
