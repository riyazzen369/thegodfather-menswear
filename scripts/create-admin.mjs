#!/usr/bin/env node
/* Create (or reset) a catalogue admin: a confirmed Supabase Auth user + a row in public.admins.
   Prints nothing secret; writes the credentials to a file outside the repo (default: your temp folder; a path inside the repo is refused).
     SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/create-admin.mjs owner@example.com [out-file] */
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'
import { writeFileSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, relative, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
const { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key } = process.env
const [email, outArg] = process.argv.slice(2)
const out = resolve(outArg ?? join(tmpdir(), 'ADMIN-CREDENTIALS-godfather.txt'))
const rel = relative(fileURLToPath(new URL('..', import.meta.url)), out)
if (rel && !rel.startsWith('..') && !isAbsolute(rel)) { console.error('Refusing to write credentials inside the repo: ' + out + '. Pick a path outside it.'); process.exit(1) }
if (!url || !key || !email) { console.error('usage: SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/create-admin.mjs <email> [out-file]'); process.exit(1) }
const sb = createClient(url, key, { auth: { persistSession: false } })
const password = randomBytes(15).toString('base64url')
let id
const { data, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true })
if (error) {
  if (!/already/i.test(error.message)) throw error
  const { data: list } = await sb.auth.admin.listUsers({ perPage: 1000 })
  id = list.users.find(u => u.email?.toLowerCase() === email.toLowerCase())?.id
  if (!id) throw new Error('user exists but was not found')
  const { error: e2 } = await sb.auth.admin.updateUserById(id, { password }); if (e2) throw e2
} else id = data.user.id
const { error: e3 } = await sb.from('admins').upsert({ user_id: id, email }); if (e3) throw e3
writeFileSync(out, `The Godfather Menswear: catalogue admin\nAdmin page: https://riyazzen369.github.io/thegodfather-menswear/admin/\nEmail: ${email}\nPassword: ${password}\n(Change it after first sign-in: ask the developer, or reset it in Supabase > Authentication > Users.)\n`, { mode: 0o600 })
chmodSync(out, 0o600)
console.log(`admin ready: ${email} (credentials written to ${out})`)
