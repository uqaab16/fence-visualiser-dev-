// SR-44 reproduction: what does the Proposal Log show when the backend delete fails?
const { chromium } = require('playwright'); const http = require('http'); const fs = require('fs'); const path = require('path');
const DIST = process.argv[2]; const PORT = 4181; const BASE = `http://127.0.0.1:${PORT}`;
const uid = '11111111-1111-1111-1111-111111111111', cid = '22222222-2222-2222-2222-222222222222';
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url'); const exp = Math.floor(Date.now() / 1000) + 86400;
const SESSION = { access_token: `${b64u({ alg: 'HS256', typ: 'JWT' })}.${b64u({ sub: uid, role: 'authenticated', exp })}.sig`, token_type: 'bearer', expires_in: 86400, expires_at: exp, refresh_token: 'fake',
  user: { id: uid, aud: 'authenticated', role: 'authenticated', email: 'owner@example.test', email_confirmed_at: '2026-01-01T00:00:00Z', app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, identities: [], created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' } };
const cors = () => ({ 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' });
const mk = (n) => ({ id: `q${n}`, company_id: cid, user_id: uid, quote_number: `FNC-0000${n}`, customer_name: `Customer ${n}`, customer_email: 'c@example.test', customer_phone: '0400', customer_address: `${n} Test St`, spec: { fenceLength: 10, message: '', status: 'pending', planSummary: { material: 'slat_fencing', height: 1500, colorName: 'Black', segmentsCount: 1, gatesCount: 0 } }, line_items: [], total: 1000 + n, created_at: '2026-10-01T10:00:00Z' });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(DIST, p);
  if (!f.startsWith(DIST) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
async function scenario(browser, name, mode) {
  const db = { quotes: [mk(1), mk(2), mk(3)] }; const dialogs = []; const consoleErrors = []; let deleteCalls = 0;
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), ['sb-dehladkrsyozruyrpjgm-auth-token', JSON.stringify(SESSION)]);
  await ctx.route((u) => u.origin !== BASE && !u.hostname.endsWith('supabase.co'), (r) => r.abort());
  await ctx.route((u) => u.hostname.endsWith('supabase.co'), async (route, req) => {
    const p = new URL(req.url()).pathname, m = req.method(); const json = (o, s = 200) => route.fulfill({ status: s, contentType: 'application/json', headers: cors(), body: JSON.stringify(o) });
    if (m === 'OPTIONS') return route.fulfill({ status: 204, headers: cors() });
    const obj = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    if ((p === '/rest/v1/profiles' || p === '/rest/v1/custom_pricing') && m === 'GET') return json(obj ? { company_id: cid } : [{ company_id: cid }]);
    if (p === '/rest/v1/designs' && m === 'GET') return json(obj ? null : []);
    if (p === '/rest/v1/quotes' && m === 'GET') return json(db.quotes);
    if (p === '/rest/v1/quotes' && m === 'DELETE') { deleteCalls++;
      if (mode === 'ok') { db.quotes = []; return route.fulfill({ status: 204, headers: cors() }); }
      if (mode === 'server-error') return json({ message: 'internal error' }, 500);
      if (mode === 'rls-denied') return json({ code: '42501', message: 'new row violates row-level security policy' }, 403);
      if (mode === 'zero-rows') return route.fulfill({ status: 204, headers: cors() }); // RLS filtered every row: PostgREST reports success, nothing deleted
      if (mode === 'network') return route.abort('failed'); }
    return json({}, 404);
  });
  const page = await ctx.newPage(); page.on('dialog', (d) => { dialogs.push(d.message()); d.accept(); }); page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 90)); });
  await page.goto(BASE); await page.waitForSelector('input[type=file]', { state: 'attached', timeout: 15000 });
  await page.locator('button[title="Toggle right pricing breakdown sidebar"]').click();
  await page.getByText('Proposal Log').click();
  const rows = () => page.locator('[title="Click to view full inquiry details"]').count();
  const before = await rows(); const textBefore = await page.locator('body').innerText();
  await page.getByText('Clear All').click(); await new Promise((r) => setTimeout(r, 1500));
  const after = await rows(); const textAfter = await page.locator('body').innerText();
  const errorShown = /fail|error|could not|unable|try again/i.test(textAfter.replace(textBefore, ''));
  await page.reload(); await page.waitForSelector('input[type=file]', { state: 'attached' });
  await page.locator('button[title="Toggle right pricing breakdown sidebar"]').click(); await page.getByText('Proposal Log').click();
  const afterReload = await rows();
  console.log(`${name.padEnd(34)} confirm dialog: ${dialogs.length ? 'yes' : 'NO'} | delete requests sent: ${deleteCalls} | rows before: ${before} -> after click: ${after} -> after reload: ${afterReload} | error shown to user: ${errorShown ? 'yes' : 'NO'} | console: ${consoleErrors.filter((c) => /delete/i.test(c)).length ? 'logged' : 'nothing'}`);
  await ctx.close();
}
(async () => { await new Promise((r) => server.listen(PORT, r)); const browser = await chromium.launch();
  await scenario(browser, 'A. success (control)', 'ok');
  await scenario(browser, 'B. server error 500', 'server-error');
  await scenario(browser, 'C. permission denied (RLS) 403', 'rls-denied');
  await scenario(browser, 'D. nothing deleted, reports success', 'zero-rows');
  await scenario(browser, 'E. network failure', 'network');
  await browser.close(); server.close(); })().catch((e) => { console.error('ERR', e); server.close(); process.exit(2); });
