import { Client } from 'pg'
import bcrypt from 'bcryptjs'

const client = new Client({
  connectionString: 'postgresql://neondb_owner:npg_NDrg3StRE4jY@ep-still-thunder-an4tpncc-pooler.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require'
})

await client.connect()

const newPassword = 'AdminPass123!'
const hash = await bcrypt.hash(newPassword, 12)

await client.query(`
  UPDATE betterbase_meta.admin_users
  SET password_hash = $1
  WHERE email = 'admin@example.com'
`, [hash])

console.log('Password updated to:', newPassword)
console.log('Hash:', hash)

await client.end()
