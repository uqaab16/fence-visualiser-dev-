// Run: build the app (any VITE_SUPABASE_URL/ANON_KEY), then NODE_PATH=<global node_modules with playwright> node tests/e2e/sr44_delete_harness.cjs <dist dir>
// SR-44 failure-injection test of the REAL built app in headless Chromium against a simulated Supabase backend.
const { chromium } = require('playwright'); const http = require('http'); const fs = require('fs'); const path = require('path');
const DIST = process.argv[2]; const PORT = 4183; const BASE = `http://127.0.0.1:${PORT}`;
const uid = '11111111-1111-1111-1111-111111111111', cid = '22222222-2222-2222-2222-222222222222';
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url'); const exp = Math.floor(Date.now() / 1000) + 86400;
const SESSION = { access_token: `${b64u({ alg: 'HS256', typ: 'JWT' })}.${b64u({ sub: uid, role: 'authenticated', exp })}.sig`, token_type: 'bearer', expires_in: 86400, expires_at: exp, refresh_token: 'fake',
  user: { id: uid, aud: 'authenticated', role: 'authenticated', email: 'owner@example.test', email_confirmed_at: '2026-01-01T00:00:00Z', app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, identities: [], created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' } };
const cors = () => ({ 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' });
const mkQuote = (n) => ({ id: `q${n}`, company_id: cid, user_id: uid, quote_number: `FNC-0000${n}`, customer_name: `Customer ${n}`, customer_email: 'c@example.test', customer_phone: '0400', customer_address: `${n} Test St`, spec: { fenceLength: 10, message: '', status: 'pending', planSummary: { material: 'slat_fencing', height: 1500, colorName: 'Black', segmentsCount: 1, gatesCount: 0 } }, line_items: [], total: 1000 + n, created_at: '2026-10-01T10:00:00Z' });
let results = []; const check = (n, ok, extra = '') => { results.push([n, ok]); console.log((ok ? 'PASS ' : 'FAIL ') + n + (extra ? '  [' + extra + ']' : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(DIST, p);
  if (!f.startsWith(DIST) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
const inList = (v) => (v || '').replace(/^in\.\(|\)$/g, '').split(',').map((x) => x.replace(/"/g, '')).filter(Boolean);

// backend state is created per scenario; `mode` can be changed mid-scenario (to test retry)
function backend() {
  const s = { quotes: [mkQuote(1), mkQuote(2), mkQuote(3)], designs: [{ id: 'd1', quote_id: 'q1' }, { id: 'd2', quote_id: 'q2' }], photos: [{ id: 'p1', design_id: 'd1', storage_path: `${cid}/${uid}/one.jpg` }, { id: 'p2', design_id: 'd2', storage_path: `${cid}/${uid}/two.jpg` }],
    files: new Set([`${cid}/${uid}/one.jpg`, `${cid}/${uid}/two.jpg`]), mode: 'ok', storageMode: 'ok', delayMs: 0, log: [], quoteDeleteBodies: [] };
  s.handler = async (route, req) => {
    const u = new URL(req.url()), p = u.pathname, m = req.method(); const q = u.searchParams;
    const json = (o, st = 200) => route.fulfill({ status: st, contentType: 'application/json', headers: cors(), body: JSON.stringify(o) });
    if (m === 'OPTIONS') return route.fulfill({ status: 204, headers: cors() });
    const obj = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    if ((p === '/rest/v1/profiles' || p === '/rest/v1/custom_pricing') && m === 'GET') return json(obj ? { company_id: cid } : [{ company_id: cid }]);
    if (p === '/rest/v1/quotes' && m === 'GET') return json(s.quotes);
    if (p === '/rest/v1/designs' && m === 'GET') { const ids = inList(q.get('quote_id')); if (q.get('user_id')) return json(obj ? null : []); return json(s.designs.filter((d) => ids.includes(d.quote_id)).map((d) => ({ id: d.id }))); }
    if (p === '/rest/v1/photos' && m === 'GET') { const ids = inList(q.get('design_id')); return json(s.photos.filter((x) => ids.includes(x.design_id)).map((x) => ({ storage_path: x.storage_path }))); }
    if (p === '/storage/v1/object/yard-photos' && m === 'DELETE') {
      const prefixes = JSON.parse(req.postData() || '{}').prefixes || []; s.log.push('storage-remove'); s.storagePaths = prefixes;
      if (s.storageMode === 'fail') return json({ message: 'storage unavailable' }, 500);
      prefixes.forEach((x) => s.files.delete(x)); return json(prefixes.map((x) => ({ name: x })));
    }
    if (p === '/rest/v1/quotes' && m === 'DELETE') {
      s.log.push('quotes-delete'); const ids = inList(q.get('id')); s.quoteDeleteBodies.push(ids); if (s.delayMs) await sleep(s.delayMs);
      if (s.mode === 'server-error') return json({ message: 'internal error' }, 500);
      if (s.mode === 'rls-denied') return json({ code: '42501', message: 'permission denied' }, 403);
      if (s.mode === 'network') return route.abort('failed');
      if (s.mode === 'zero-rows') return json([]); // RLS matched nothing: a 200 with no rows
      const doomed = s.mode === 'partial' ? ids.filter((i) => i !== 'q3') : ids; const removed = s.quotes.filter((x) => doomed.includes(x.id));
      s.quotes = s.quotes.filter((x) => !doomed.includes(x.id));
      const dIds = s.designs.filter((d) => doomed.includes(d.quote_id)).map((d) => d.id); s.designs = s.designs.filter((d) => !dIds.includes(d.id)); s.photos = s.photos.filter((x) => !dIds.includes(x.design_id)); // the cascade
      return json(removed.map((x) => ({ id: x.id })));
    }
    return json({}, 404);
  };
  return s;
}
async function open(browser, be) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), ['sb-dehladkrsyozruyrpjgm-auth-token', JSON.stringify(SESSION)]);
  await ctx.route((u) => u.origin !== BASE && !u.hostname.endsWith('supabase.co'), (r) => r.abort());
  await ctx.route((u) => u.hostname.endsWith('supabase.co'), be.handler);
  const page = await ctx.newPage(); const dialogs = []; page.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss(); });
  await page.goto(BASE); await page.waitForSelector('input[type=file]', { state: 'attached', timeout: 15000 });
  await page.locator('button[title="Toggle right pricing breakdown sidebar"]').click();
  await page.getByText('Proposal Log').click();
  return { ctx, page, dialogs };
}
const rows = (page) => page.locator('[title="Click to view full inquiry details"]').count();
const modal = (page) => page.getByRole('alertdialog');
async function reloadRows(page) { await page.reload(); await page.waitForSelector('input[type=file]', { state: 'attached' }); await page.locator('button[title="Toggle right pricing breakdown sidebar"]').click(); await page.getByText('Proposal Log').click(); await sleep(400); return rows(page); }

(async () => {
  await new Promise((r) => server.listen(PORT, r)); const browser = await chromium.launch();

  console.log('\n== 1. Clear All, success ==');
  let be = backend(); be.delayMs = 700; let { ctx, page, dialogs } = await open(browser, be);
  check('3 proposals listed', (await rows(page)) === 3);
  await page.getByText('Clear All').click();
  await modal(page).waitFor();
  const txt = await modal(page).innerText();
  check('in-app confirm (no browser dialog) says how many and that it is permanent', /Delete all 3 proposals\?/.test(txt) && /permanently deleted/.test(txt) && /cannot be undone/i.test(txt) && dialogs.length === 0, txt.replace(/\n+/g, ' | ').slice(0, 150));
  check('nothing is deleted just by opening the confirm', be.log.length === 0 && (await rows(page)) === 3);
  await modal(page).getByRole('button', { name: /Delete 3 Proposals/ }).click();
  await sleep(250);
  const busyBtns = await modal(page).getByRole('button').evaluateAll((bs) => bs.map((b) => ({ t: b.innerText, d: b.disabled })));
  check('while deleting: buttons disabled and label shows "Deleting…"', busyBtns.length === 2 && busyBtns.every((b) => b.d) && busyBtns.some((b) => /Deleting/.test(b.t)), JSON.stringify(busyBtns));
  await sleep(1500);
  check('stored photo files are removed BEFORE the quotes are deleted, and only the linked ones', be.log.join(',') === 'storage-remove,quotes-delete' && be.storagePaths.length === 2 && be.storagePaths.every((x) => x.startsWith(`${cid}/${uid}/`)), be.log.join(','));
  check('list is empty and the confirm closed after the database confirmed', (await rows(page)) === 0 && (await modal(page).count()) === 0);
  check('cascade (simulated): designs and photo rows gone, files gone', be.designs.length === 0 && be.photos.length === 0 && be.files.size === 0);
  check('after a reload the quotes are really gone', (await reloadRows(page)) === 0);
  await ctx.close();

  for (const [label, mode] of [['server error 500', 'server-error'], ['permission denied 403 (RLS)', 'rls-denied'], ['network failure', 'network'], ['"success" that deleted nothing', 'zero-rows']]) {
    console.log(`\n== ${label} ==`);
    be = backend(); be.mode = mode; ({ ctx, page, dialogs } = await open(browser, be));
    await page.getByText('Clear All').click(); await modal(page).getByRole('button', { name: /Delete 3 Proposals/ }).click(); await sleep(1200);
    const err = await modal(page).getByRole('alert').innerText().catch(() => '');
    check('all 3 proposals stay visible', (await rows(page)) === 3);
    check('a clear error is shown and the dialog stays open for a retry', !!err && (await modal(page).count()) === 1, err.slice(0, 110));
    check('button now offers "Try again"', (await modal(page).getByRole('button', { name: 'Try again' }).count()) === 1);
    check('after a reload nothing was lost', (await reloadRows(page)) === 3);
    // retry works once the problem is gone
    await page.getByText('Clear All').click(); await modal(page).getByRole('button', { name: /Delete 3 Proposals/ }).click(); await sleep(900);
    be.mode = 'ok'; await modal(page).getByRole('button', { name: 'Try again' }).click(); await sleep(1200);
    check('retry succeeds once the backend recovers: list empty, dialog closed', (await rows(page)) === 0 && (await modal(page).count()) === 0);
    await ctx.close();
  }

  console.log('\n== partial success ==');
  be = backend(); be.mode = 'partial'; ({ ctx, page } = await open(browser, be));
  await page.getByText('Clear All').click(); await modal(page).getByRole('button', { name: /Delete 3 Proposals/ }).click(); await sleep(1200);
  const pe = await modal(page).getByRole('alert').innerText().catch(() => '');
  check('2 of 3 deleted: only the failed one stays in the list', (await rows(page)) === 1 && /Customer 3/.test(await page.locator('body').innerText()));
  check('message says "Deleted 2 of 3" and the dialog now targets the remaining one', /Deleted 2 of 3/.test(pe) && /Delete the remaining proposal\?/.test(await modal(page).innerText()), pe.slice(0, 120));
  await ctx.close();

  console.log('\n== storage (photo files) cannot be removed ==');
  be = backend(); be.storageMode = 'fail'; ({ ctx, page } = await open(browser, be));
  await page.getByText('Clear All').click(); await modal(page).getByRole('button', { name: /Delete 3 Proposals/ }).click(); await sleep(1200);
  check('the quotes are NOT deleted when the files could not be removed (no half-deleted state)', !be.log.includes('quotes-delete') && be.quotes.length === 3 && (await rows(page)) === 3);
  check('an error is shown', (await modal(page).getByRole('alert').count()) === 1);
  await ctx.close();

  console.log('\n== cancel ==');
  be = backend(); ({ ctx, page } = await open(browser, be));
  await page.getByText('Clear All').click(); await modal(page).getByRole('button', { name: 'Cancel' }).click(); await sleep(300);
  check('Cancel sends nothing and keeps everything', be.log.length === 0 && (await rows(page)) === 3 && (await modal(page).count()) === 0);
  await page.getByText('Clear All').click(); await page.keyboard.press('Escape'); await sleep(300);
  check('Escape also cancels', be.log.length === 0 && (await modal(page).count()) === 0);
  await ctx.close();

  console.log('\n== delete one proposal ==');
  be = backend(); ({ ctx, page } = await open(browser, be));
  await page.locator('[title="Click to view full inquiry details"]').nth(1).click();
  await page.getByRole('button', { name: 'Delete Proposal' }).first().click(); await modal(page).waitFor();
  const one = await modal(page).innerText();
  check('single-delete confirm names the proposal, states it is permanent', /Delete this proposal\?/.test(one) && /cannot be undone/i.test(one) && /FNC-0000\d/.test(one), one.replace(/\n+/g, ' | ').slice(0, 140));
  check('the customer name in the confirm is masked for PostHog replay (ph-mask)', (await modal(page).locator('.ph-mask').count()) >= 1);
  const targetId = be.quotes[1].id;
  await modal(page).getByRole('button', { name: 'Delete Proposal' }).click(); await sleep(1200);
  check('only that one is deleted (request carries just its id) and the list shows 2', JSON.stringify(be.quoteDeleteBodies[0]) === JSON.stringify([targetId]) && (await rows(page)) === 2 && be.quotes.length === 2);
  check('the detail view closed after a confirmed delete', (await page.getByText('Proposal Record Details').count()) === 0);
  await ctx.close();
  be = backend(); be.mode = 'server-error'; ({ ctx, page } = await open(browser, be));
  await page.locator('[title="Click to view full inquiry details"]').first().click();
  await page.getByRole('button', { name: 'Delete Proposal' }).first().click(); await modal(page).getByRole('button', { name: 'Delete Proposal' }).click(); await sleep(1200);
  check('failed single delete: error shown, proposal and its detail view stay', (await modal(page).getByRole('alert').count()) === 1 && (await page.getByText('Proposal Record Details').count()) === 1 && be.quotes.length === 3);
  await ctx.close();

  await browser.close(); server.close();
  const failed = results.filter(([, ok]) => !ok); console.log(`\n${results.length - failed.length}/${results.length} checks passed`); process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error('HARNESS ERROR', e); server.close(); process.exit(2); });
