import pg from 'pg';
import bcrypt from 'bcryptjs';
import { requireEnv } from './require-env.mjs';
const [email, password, role = 'analyst'] = process.argv.slice(2);
if (!email || !password || !['admin', 'analyst'].includes(role)) {
  console.error('Usage: node scripts/create-user.mjs email password [admin|analyst]');
  process.exit(1);
}
const pool = new pg.Pool({ connectionString: requireEnv('DATABASE_URL') });
try {
  await pool.query(
    'INSERT INTO users(email,password_hash,role) VALUES($1,$2,$3) ON CONFLICT(email) DO UPDATE SET password_hash=EXCLUDED.password_hash,role=EXCLUDED.role',
    [email.toLowerCase(), await bcrypt.hash(password, 12), role],
  );
  console.log('User ready:', email);
} finally {
  await pool.end();
}
