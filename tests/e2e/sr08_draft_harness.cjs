// Run: npm run build (with VITE_SUPABASE_URL/ANON_KEY set to any values), then NODE_PATH=<global node_modules with playwright> node tests/e2e/sr08_draft_harness.cjs <dist dir>
// SR-08 Part 1 end-to-end test of the REAL built app in headless Chromium against a simulated Supabase backend
// (the dev sandbox cannot reach Supabase). Checks what the app sends: draft autosave, photo shrink + upload,
// one draft per user, restore/discard prompt, no overwrite of an unanswered draft, quote linking, bad-file handling.
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const DIST = process.argv[2]; const PORT = 4179; const BASE = `http://127.0.0.1:${PORT}`;
const uid = '11111111-1111-1111-1111-111111111111', cid = '22222222-2222-2222-2222-222222222222';
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const exp = Math.floor(Date.now() / 1000) + 86400;
const SESSION = { access_token: `${b64u({ alg: 'HS256', typ: 'JWT' })}.${b64u({ sub: uid, role: 'authenticated', exp })}.sig`, token_type: 'bearer', expires_in: 86400, expires_at: exp, refresh_token: 'fake',
  user: { id: uid, aud: 'authenticated', role: 'authenticated', email: 'owner@example.test', email_confirmed_at: '2026-01-01T00:00:00Z', app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, identities: [], created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' } };
const cors = () => ({ 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' });
let results = []; const check = (n, ok, extra = '') => { results.push([n, ok]); console.log((ok ? 'PASS ' : 'FAIL ') + n + (extra ? '  [' + extra + ']' : '')); };

// static server for the built app
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(DIST, p);
  if (!f.startsWith(DIST) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});

function jpegSize(buf) { // read width/height from a JPEG's SOF marker
  let i = 2; while (i < buf.length) { if (buf[i] !== 0xFF) { i++; continue; } const m = buf[i + 1];
    if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    i += 2 + buf.readUInt16BE(i + 2); } return null;
}

// ---- simulated backend, shared across page reloads so "refresh" really restores from the saved draft ----
function makeBackend() {
  const db = { designs: [], photos: [], quotes: [] }; const files = new Map(); const log = [];
  let n = 0; const id = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
  const filt = (rows, q) => rows.filter((r) => [...q.entries()].every(([k, v]) => { if (!v.startsWith('eq.') && !v.startsWith('in.')) return true;
    if (v.startsWith('eq.')) return String(r[k]) === v.slice(3); return v.slice(4, -1).split(',').includes(String(r[k])); }));
  async function handler(route, req) {
    const u = new URL(req.url()), p = u.pathname, m = req.method(); const q = u.searchParams;
    const json = (o, s = 200) => route.fulfill({ status: s, contentType: 'application/json', headers: cors(), body: JSON.stringify(o) });
    if (m === 'OPTIONS') return route.fulfill({ status: 204, headers: cors() });
    const obj = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    const body = () => { try { return JSON.parse(req.postData() || 'null'); } catch { return null; } };
    let mt;
    if (p === '/rest/v1/profiles' && m === 'GET') return json(obj ? { company_id: cid } : [{ company_id: cid }]);
    if (p === '/rest/v1/custom_pricing' && m === 'GET') return json(obj ? { company_id: cid } : [{ company_id: cid }]);
    if (p === '/rest/v1/quotes' && m === 'GET') return json(db.quotes);
    if (p === '/rest/v1/quotes' && m === 'POST') { const r = { id: id(), quote_number: 'FNC-00001', ...body() }; db.quotes.push(r); log.push({ t: 'quote-insert', row: r }); return json(r, 201); }
    if ((mt = p.match(/^\/rest\/v1\/(designs|photos)$/))) {
      const t = mt[1], rows = db[t];
      if (m === 'GET') { const r = filt(rows, q); return json(obj ? (r[0] ?? null) : r); }
      if (m === 'POST') { const r = { id: id(), created_at: new Date().toISOString(), ...body() }; rows.push(r); log.push({ t: t + '-insert', row: JSON.parse(JSON.stringify(r)) }); return json(obj ? r : [r], 201); }
      if (m === 'PATCH') { const r = filt(rows, q); r.forEach((x) => Object.assign(x, body())); log.push({ t: t + '-update', n: r.length, body: body() }); return route.fulfill({ status: 204, headers: cors() }); }
      if (m === 'DELETE') { const r = filt(rows, q); r.forEach((x) => rows.splice(rows.indexOf(x), 1)); log.push({ t: t + '-delete', n: r.length }); return route.fulfill({ status: 204, headers: cors() }); }
    }
    if ((mt = p.match(/^\/storage\/v1\/object\/yard-photos\/(.+)$/)) && (m === 'POST' || m === 'PUT')) {
      const buf = req.postDataBuffer(); const ct = req.headers()['content-type'] || '';
      // supabase-js sends multipart/form-data; pull the file bytes out of it
      let bytes = buf; const bm = ct.match(/boundary=(.+)$/);
      if (bm) { const s = buf.toString('latin1'); const start = s.indexOf('\r\n\r\n', s.indexOf('filename')) + 4; const end = s.lastIndexOf('\r\n--' + bm[1]); bytes = Buffer.from(s.slice(start, end), 'latin1'); }
      const key = decodeURIComponent(mt[1]); files.set(key, bytes); log.push({ t: 'storage-upload', path: key, size: bytes.length, ct, dims: jpegSize(bytes) });
      return json({ Key: 'yard-photos/' + key, Id: id() });
    }
    if ((mt = p.match(/^\/storage\/v1\/object\/sign\/yard-photos\/(.+)$/)) && m === 'POST') { log.push({ t: 'storage-sign', path: decodeURIComponent(mt[1]) }); return json({ signedURL: `/object/sign/yard-photos/${mt[1]}?token=t` }); }
    if ((mt = p.match(/^\/storage\/v1\/object\/sign\/yard-photos\/(.+)$/)) && m === 'GET') { const b = files.get(decodeURIComponent(mt[1])); return b ? route.fulfill({ status: 200, contentType: 'image/jpeg', headers: cors(), body: b }) : route.fulfill({ status: 404, headers: cors() }); }
    if (p === '/storage/v1/object/yard-photos' && m === 'DELETE') { const prefixes = body()?.prefixes || []; prefixes.forEach((x) => files.delete(x)); log.push({ t: 'storage-remove', paths: prefixes }); return json(prefixes.map((x) => ({ name: x }))); }
    console.log('UNHANDLED', m, p); return json({}, 404);
  }
  return { db, files, log, handler };
}

async function newPage(browser, be) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), ['sb-dehladkrsyozruyrpjgm-auth-token', JSON.stringify(SESSION)]);
  await ctx.route((u) => u.origin !== BASE && !u.hostname.endsWith('supabase.co'), (r) => r.abort());
  await ctx.route((u) => u.hostname.endsWith('supabase.co'), be.handler);
  const page = await ctx.newPage(); page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
  await page.goto(BASE); await page.waitForSelector('input[type=file]', { state: 'attached', timeout: 15000 });
  return { ctx, page };
}
const photoBuffer = (page, w, h, kind = 'jpeg') => page.evaluate(async ([w, h, kind]) => { // a big noisy photo made in the browser
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, w, h); grad.addColorStop(0, '#7fb2e5'); grad.addColorStop(1, '#3b6b2e'); g.fillStyle = grad; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(${Math.random() * 255 | 0},${Math.random() * 255 | 0},${Math.random() * 255 | 0},.5)`; g.fillRect(Math.random() * w, Math.random() * h, 40, 40); }
  const b = await new Promise((r) => c.toBlob(r, kind === 'png' ? 'image/png' : 'image/jpeg', 0.95)); return Array.from(new Uint8Array(await b.arrayBuffer()));
}, [w, h, kind]).then((a) => Buffer.from(a));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const addRight = (page) => page.getByRole('button', { name: /Add Right/ }).first().click(); // first press creates 2 posts + 1 segment
const addLeft = (page) => page.getByRole('button', { name: /Add Left/ }).first().click();
const drawTwoPosts = (page) => addRight(page);

(async () => {
  await new Promise((r) => server.listen(PORT, r));
  const browser = await chromium.launch();
  const be = makeBackend(); const L = be.log;

  // ---------- 1. fresh session: upload a big photo and draw ----------
  let { ctx, page } = await newPage(browser, be);
  check('no restore prompt when nothing is saved', (await page.getByText('Restore your unsaved design?').count()) === 0);
  const big = await photoBuffer(page, 4032, 3024);
  await page.setInputFiles('input[type=file]', { name: 'IMG_0001.jpg', mimeType: 'image/jpeg', buffer: big });
  await page.waitForSelector('img.ph-no-capture', { timeout: 10000 });
  await drawTwoPosts(page);
  const writesBefore = L.length;
  await sleep(1200);
  check('nothing is saved while the user is still changing things (debounce)', L.length === writesBefore, `${L.length - writesBefore} writes after 1.2s`);
  await sleep(3500);
  const dIns = L.filter((e) => e.t === 'designs-insert'), up = L.filter((e) => e.t === 'storage-upload');
  check('draft saved once after the pause', dIns.length === 1);
  const row = dIns[0]?.row || {};
  check('draft row is owned by the user and company, marked draft, versioned', row.user_id === uid && row.company_id === cid && row.is_draft === true && row.schema_version === 1);
  check('draft state holds the drawing (posts, segments, style, offset, background)', row.state?.posts?.length >= 2 && Array.isArray(row.state?.segments) && row.state?.material && row.state?.color?.name && row.state?.globalOffset && row.state?.background === 'upload', `posts=${row.state?.posts?.length}`);
  check('one photo uploaded, under <company>/<user>/ as .jpg', up.length === 1 && new RegExp(`^${cid}/${uid}/[0-9a-f-]{36}\\.jpg$`).test(up[0]?.path || ''), up[0]?.path);
  check('photo was shrunk to <= 1600px wide', up[0]?.dims && up[0].dims.w <= 1600 && up[0].dims.w > 1000, JSON.stringify(up[0]?.dims));
  check('photo is far smaller than the original', up[0] && up[0].size < big.length / 2 && up[0].size < 1_000_000, `${big.length} -> ${up[0]?.size} bytes`);
  check('photo row recorded with the draft id', be.db.photos.length === 1 && be.db.photos[0].design_id === be.db.designs[0]?.id && be.db.photos[0].storage_path === up[0]?.path);

  // ---------- 2. more edits: same draft, same photo ----------
  await addRight(page);
  await sleep(3500);
  check('further edits replace the same draft (no second draft)', be.db.designs.length === 1 && L.filter((e) => e.t === 'designs-insert').length === 1 && L.some((e) => e.t === 'designs-update'));
  check('the photo is not uploaded again', L.filter((e) => e.t === 'storage-upload').length === 1);
  const postsSaved = be.db.designs[0].state.posts.length;
  await ctx.close();

  // ---------- 3. refresh: prompt, but never auto-overwrite ----------
  const w0 = L.length;
  ({ ctx, page } = await newPage(browser, be));
  await page.getByText('Restore your unsaved design?').waitFor({ timeout: 10000 });
  check('restore prompt appears after a refresh', true);
  await sleep(3500);
  check('empty canvas does NOT overwrite the saved draft while the prompt is open', !L.slice(w0).some((e) => /^(designs|photos)-(insert|update|delete)$/.test(e.t) || e.t === 'storage-remove') && be.db.designs[0].state.posts.length === postsSaved);
  await page.getByRole('button', { name: 'Restore' }).click();
  await sleep(500);
  const imgSrc = await page.locator('img.ph-no-capture').first().getAttribute('src');
  check('restored photo is shown from a signed URL', /\/object\/sign\/yard-photos\//.test(imgSrc || ''), (imgSrc || '').slice(0, 60));
  check('restored photo keeps the ph-no-capture class (PostHog replay blocks it)', (await page.locator('img.ph-no-capture').count()) >= 1);
  const w1 = L.length; await sleep(3500);
  check('restoring does not trigger a re-save or re-upload', !L.slice(w1).some((e) => /^(designs|photos)-(insert|update)$/.test(e.t) || e.t === 'storage-upload'));
  // restored posts present? draw one more and confirm count grows from the restored number
  await addLeft(page);
  await sleep(3500);
  check('drawing continues from the restored design', be.db.designs[0].state.posts.length > postsSaved, `${postsSaved} -> ${be.db.designs[0].state.posts.length}`);
  check('still exactly one draft and one stored photo', be.db.designs.length === 1 && be.db.photos.length === 1 && be.files.size === 1);

  // ---------- 4. quote submit attaches the design ----------
  await page.locator('button[title="Toggle right pricing breakdown sidebar"]').click();
  await page.getByText('Compile & Request Proposal').click();
  await page.locator('input[placeholder="Jack Taylor"]').fill('Test Customer');
  await page.locator('input[placeholder="client@gmail.com"]').fill('cust@example.test');
  await page.locator('input[placeholder="+61 400 000 000"]').fill('0400 000 000');
  await page.locator('input[placeholder="29 Belmore Road, Randwick NSW 2031"]').fill('1 Test St');
  const w4 = L.length;
  await page.locator('button[type=submit]').last().click();
  await sleep(2500);
  const qIns = L.slice(w4).find((e) => e.t === 'quote-insert');
  const finalUpd = L.slice(w4).find((e) => e.t === 'designs-update' && e.body && e.body.is_draft === false);
  check('quote saved', !!qIns);
  check('the draft design was finalised and linked to the new quote (is_draft=false, quote_id)', !!finalUpd && finalUpd.body.quote_id === qIns?.row.id, JSON.stringify(finalUpd?.body || {}).slice(0, 120));
  check('the design (and its photo) is kept after the quote is saved', be.db.designs.length === 1 && be.db.designs[0].is_draft === false && be.db.photos.length === 1 && be.files.size === 1);
  await ctx.close();
  // refresh: a finalised design is not offered as a draft
  ({ ctx, page } = await newPage(browser, be));
  await sleep(1500);
  check('a design attached to a quote is not offered for restore', (await page.getByText('Restore your unsaved design?').count()) === 0);
  // a new design after the quote starts a NEW draft and leaves the quote design alone
  await page.setInputFiles('input[type=file]', { name: 'two.jpg', mimeType: 'image/jpeg', buffer: await photoBuffer(page, 3000, 2000) });
  await page.waitForSelector('img.ph-no-capture'); await addRight(page); await sleep(4000);
  check('next design after a quote becomes a separate new draft', be.db.designs.length === 2 && be.db.designs.filter((d) => d.is_draft).length === 1 && be.db.designs.filter((d) => d.quote_id).length === 1);
  await ctx.close();
  // put things back for step 5: drop the extra draft so step 5 sees one draft
  be.db.designs.splice(0, be.db.designs.length, ...be.db.designs.filter((d) => d.is_draft)); 

  // ---------- 5. start fresh deletes the draft and its photo ----------
  ({ ctx, page } = await newPage(browser, be));
  await page.getByText('Restore your unsaved design?').waitFor({ timeout: 10000 });
  const w2 = L.length;
  await page.getByRole('button', { name: 'Start fresh' }).click();
  await sleep(1500);
  check('"Start fresh" deletes the draft, its photo row and the stored file', be.db.designs.length === 0 && L.slice(w2).some((e) => e.t === 'storage-remove') && L.slice(w2).some((e) => e.t === 'photos-delete'));
  await sleep(3500);
  check('nothing is re-saved from the empty canvas afterwards', be.db.designs.length === 0);

  // ---------- 6. bad file: photo is skipped, drawing still saved, app keeps working ----------
  const uploadsBefore6 = L.filter((e) => e.t === 'storage-upload').length;
  await page.setInputFiles('input[type=file]', { name: 'fake.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('this is not an image') });
  await sleep(500);
  await drawTwoPosts(page).catch(() => {});
  await sleep(4000);
  check('a file that is not a real image does not crash the app and uploads nothing', L.filter((e) => e.t === 'storage-upload').length === uploadsBefore6 && (await page.locator('body').innerText()).length > 50);
  await ctx.close();

  await browser.close(); server.close();
  console.log('\nBACKEND LOG SUMMARY:', JSON.stringify(L.map((e) => e.t)));
  const failed = results.filter(([, ok]) => !ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error('HARNESS ERROR', e); server.close(); process.exit(2); });
