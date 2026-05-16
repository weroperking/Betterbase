import { Client } from 'pg'

const client = new Client({
  connectionString: 'postgresql://neondb_owner:npg_NDrg3StRE4jY@ep-still-thunder-an4tpncc-pooler.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require'
})

await client.connect()
const res = await client.query("SELECT id, email FROM betterbase_meta.admin_users")
console.log(JSON.stringify(res.rows, null, 2))
await client.end()
