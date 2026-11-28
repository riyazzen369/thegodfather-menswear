/* Admin: change password (current password re-checked, rules, success) and forgot password (reset email, set new password from the link).
   Mocked Supabase, no real email.  node tests/admin-password.js */
const { chromium } = require('playwright'); const { execSync, spawn } = require('child_process'); const path = require('path')
const ROOT = path.join(__dirname, '..'), MOCK = 'https://mockref.supabase.co', ANON = 'anon-test-key', PORT = 8797, URL = `http://localhost:${PORT}/`
const { ARGS } = require('./gl'); const sleep = ms => new Promise(r => setTimeout(r, ms)); let fails = 0
const ok = (n, c, i = '') => { console.log(`${c ? 'PASS' : 'FAIL'} ${n}${c ? '' : '  ' + i}`); if (!c) fails++ }
const jwt = 'e30.' + Buffer.from(JSON.stringify({ sub: 'u1', email: 'o@e.com', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url') + '.sig'
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }
const session = { access_token: jwt, token_type: 'bearer', expires_in: 3600, refresh_token: 'r', user: { id: 'u1', email: 'o@e.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } }
;(async () => {
  execSync('npx vite build --outDir dist-live --emptyOutDir', { cwd: ROOT, stdio: 'ignore', env: { ...process.env, VITE_SUPABASE_URL: MOCK, VITE_SUPABASE_ANON_KEY: ANON } })
  const srv = spawn(process.execPath, [path.join(ROOT, 'node_modules/vite/bin/vite.js'), 'preview', '--outDir', 'dist-live', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' })
  for (let i = 0; i < 60; i++) { try { await fetch(URL); break } catch { await sleep(250) } }
  const browser = await chromium.launch({ args: ARGS }); const log = { recover: [], updates: [], signins: [], signout: [] }; let CURRENT = 'old-password-123'
  try {
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 800 } })
    await ctx.route(`${MOCK}/auth/v1/**`, async r => {
      const rq = r.request(), url = rq.url(), J = (b, st = 200) => r.fulfill({ status: st, headers: cors, contentType: 'application/json', body: JSON.stringify(b) })
      if (rq.method() === 'OPTIONS') return r.fulfill({ status: 200, headers: cors })
      if (/token\?grant_type=password/.test(url)) { const b = rq.postDataJSON(); log.signins.push(b.password); return b.password === CURRENT ? J(session) : J({ error: 'invalid_grant', error_description: 'Invalid login credentials', code: 'invalid_credentials', msg: 'Invalid login credentials' }, 400) }
      if (/\/recover/.test(url)) { log.recover.push({ body: rq.postDataJSON(), url }); return J({}) }
      if (/\/user/.test(url) && rq.method() === 'PUT') { const b = rq.postDataJSON(); log.updates.push(b.password); if (b.password === CURRENT) return J({ code: 'same_password', msg: 'New password should be different from the old password.' }, 422); CURRENT = b.password; return J(session.user) }
      if (/\/logout/.test(url)) { log.signout.push(new globalThis.URL(url).searchParams.get('scope')); return r.fulfill({ status: 204, headers: cors }) }
      if (/\/user/.test(url)) return J(session.user)
      return J({})
    })
    await ctx.route(`${MOCK}/rest/v1/admins*`, r => r.request().method() === 'OPTIONS' ? r.fulfill({ status: 200, headers: cors }) : r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify([{ user_id: 'u1' }]) }))
    await ctx.route(`${MOCK}/rest/v1/**`, r => r.request().method() === 'OPTIONS' ? r.fulfill({ status: 200, headers: cors }) : r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: '[]' }))
    await ctx.route(`${MOCK}/storage/v1/**`, r => r.fulfill({ status: 404, headers: cors, body: '' }))
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/mockref|status of (4|5)\d\d|net::|Failed to load resource/.test(m.text())) errs.push(m.text()) })

    // ---- forgot password ----
    await p.goto(URL + 'admin/', { waitUntil: 'load' }); await p.waitForSelector('#adm-email')
    ok('sign-in: a "Forgot password?" link is there', await p.locator('#adm-forgot-link').isVisible())
    await p.click('#adm-forgot-link'); await p.waitForSelector('#adm-forgot-email'); await p.fill('#adm-forgot-email', 'someone@example.com'); await p.click('#adm-forgot button[type=submit]'); await p.waitForSelector('#adm-forgot-sent')
    ok('forgot: the same neutral message for any address', /If that email is registered/.test(await p.textContent('#adm-forgot-sent')))
    ok('forgot: the reset request carries the email and comes back to the admin page', log.recover.length === 1 && log.recover[0].body.email === 'someone@example.com' && /admin/.test(JSON.stringify(log.recover[0])), JSON.stringify(log.recover))
    await p.click('#adm-back-signin'); ok('forgot: Back to sign in works', await p.locator('#adm-email').isVisible())

    // ---- expired link ----
    const pe = await ctx.newPage(); await pe.goto(URL + 'admin/#error=access_denied&error_code=otp_expired&error_description=expired', { waitUntil: 'load' }); await pe.waitForSelector('#adm-link-err')
    ok('expired link: asks for a new one', /expired|already used/i.test(await pe.textContent('#adm-link-err'))); await pe.close()

    // ---- sign in, then change password ----
    await p.goto(URL + 'admin/', { waitUntil: 'load' }); await p.waitForSelector('#adm-email'); await p.fill('#adm-email', 'o@e.com'); await p.fill('#adm-password', 'old-password-123'); await p.keyboard.press('Enter')
    await p.waitForSelector('#adm-change-pw'); ok('signed in: Change password is in the top bar', true)
    await p.click('#adm-change-pw'); await p.waitForSelector('#adm-pw-form'); ok('change: the dialog opens with the current password focused', await p.evaluate(() => document.activeElement?.id === 'adm-pw-cur'))
    await p.fill('#adm-pw-cur', 'wrong-current-pw'); await p.fill('#adm-pw-new', 'a-brand-new-passphrase'); await p.fill('#adm-pw-new2', 'a-brand-new-passphrase'); await p.click('#adm-pw-save'); await sleep(500)
    ok('change: a wrong current password is refused', /current password is wrong/i.test(await p.textContent('#adm-pw-err')) && log.updates.length === 0)
    await p.fill('#adm-pw-cur', 'old-password-123'); await p.fill('#adm-pw-new', 'short'); await p.fill('#adm-pw-new2', 'short'); await p.click('#adm-pw-save'); await sleep(300)
    ok('change: a too-short new password is refused before anything is sent', /at least 12/i.test(await p.textContent('#adm-pw-err')) && log.updates.length === 0)
    await p.fill('#adm-pw-new', 'a-brand-new-passphrase'); await p.fill('#adm-pw-new2', 'a-different-passphrase'); await p.click('#adm-pw-save'); await sleep(300)
    ok('change: mismatched confirmation is refused', /do not match/i.test(await p.textContent('#adm-pw-err')) && log.updates.length === 0)
    await p.fill('#adm-pw-new', 'old-password-123'); await p.fill('#adm-pw-new2', 'old-password-123'); await p.click('#adm-pw-save'); await sleep(300)
    ok('change: the same password is refused', /different/i.test(await p.textContent('#adm-pw-err')) && log.updates.length === 0)
    await p.check('#adm-pw-others'); await p.fill('#adm-pw-new', 'a-brand-new-passphrase'); await p.fill('#adm-pw-new2', 'a-brand-new-passphrase'); await p.click('#adm-pw-save'); await p.waitForSelector('#adm-pw-done')
    ok('change: success message and the password was updated once', /Password updated/.test(await p.textContent('#adm-pw-done')) && log.updates.length === 1 && log.updates[0] === 'a-brand-new-passphrase', JSON.stringify(log.updates))
    ok('change: "sign out of other devices" was honoured', log.signout.includes('others'), JSON.stringify(log.signout))
    await p.screenshot({ path: path.join(ROOT, 'tests/out/admin-pw-done.png') }); await p.click('#adm-pw-ok'); await sleep(300); ok('change: Done closes the dialog', await p.locator('#adm-pw-form').count() === 0)
    await p.click('#adm-change-pw'); await p.waitForSelector('#adm-pw-form'); await p.keyboard.press('Escape'); await sleep(200); ok('change: Escape closes the dialog without changes', await p.locator('#adm-pw-form').count() === 0 && log.updates.length === 1)
    await p.click('#adm-change-pw'); await p.waitForSelector('#adm-pw-form'); await p.screenshot({ path: path.join(ROOT, 'tests/out/admin-pw-dialog.png') }); await p.keyboard.press('Escape')

    // ---- arriving from the reset email (recovery session) ----
    const p2 = await ctx.newPage(); p2.on('pageerror', e => errs.push(e.message))
    const hash = `#access_token=${jwt}&refresh_token=r&expires_in=3600&token_type=bearer&type=recovery`
    await p2.goto(URL + 'admin/' + hash, { waitUntil: 'load' }); await p2.waitForSelector('#adm-pw-form', { timeout: 10000 })
    ok('recovery: the link opens "Choose a new password" with no current-password box', /Choose a new password/.test(await p2.textContent('#adm-pw-title')) && await p2.locator('#adm-pw-cur').count() === 0)
    await p2.fill('#adm-pw-new', 'recovered-new-passphrase'); await p2.fill('#adm-pw-new2', 'recovered-new-passphrase'); await p2.click('#adm-pw-save'); await p2.waitForSelector('#adm-pw-done')
    ok('recovery: the new password is saved', log.updates[log.updates.length - 1] === 'recovered-new-passphrase')
    await p2.click('#adm-pw-ok'); await sleep(600); ok('recovery: Continue lands in the admin (signed in)', await p2.locator('#adm-change-pw').isVisible())
    ok('no script errors', errs.length === 0, errs.slice(0, 3).join(' | '))
  } finally { await browser.close(); srv.kill() }
  process.exit(fails ? 1 : 0)
})()
