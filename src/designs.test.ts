import { describe, it, expect, vi, beforeEach } from 'vitest';
import { computeTargetSize } from './lib/imageShrink';

// SR-08 unit tests: image sizing, state parsing, and the save/upload calls (Supabase is mocked).
const calls: { table?: string; op: string; args?: any }[] = [];
let existingDraft: { id: string; state: unknown } | null = null;
let insertError: { code?: string } | null = null;
let uploadError: unknown = null;
let photoInsertError: unknown = null;
let photoRows: { id: string; storage_path: string }[] = [];
let lookupQueue: ({ id: string; state: unknown } | null)[] | null = null;

function table(name: string) {
  const chain: any = {
    _op: 'select',
    select() { return chain; },
    eq() { return chain; },
    in() { return chain; },
    order() { return chain; },
    limit() { return chain; },
    maybeSingle: async () => ({ data: name === 'designs' ? (lookupQueue ? lookupQueue.shift() ?? null : existingDraft) : null, error: null }),
    single: async () => (insertError ? { data: null, error: insertError } : { data: { id: 'new-id' }, error: null }),
    insert(args: any) { calls.push({ table: name, op: 'insert', args }); chain._op = 'insert'; return chain; },
    update(args: any) { calls.push({ table: name, op: 'update', args }); chain._op = 'update'; return chain; },
    delete() { calls.push({ table: name, op: 'delete' }); chain._op = 'delete'; return chain; },
    then(res: any) {
      if (chain._op === 'insert' && name === 'photos') return Promise.resolve({ error: photoInsertError }).then(res);
      if (chain._op === 'select' && name === 'photos') return Promise.resolve({ data: photoRows, error: null }).then(res);
      return Promise.resolve({ error: null }).then(res);
    },
  };
  return chain;
}
vi.mock('./lib/supabase', () => ({
  supabase: {
    from: (n: string) => table(n),
    storage: {
      from: () => ({
        upload: async (path: string, _b: Blob, opts: any) => { calls.push({ op: 'upload', args: { path, opts } }); return { error: uploadError }; },
        remove: async (paths: string[]) => { calls.push({ op: 'remove', args: paths }); return { error: null }; },
        createSignedUrl: async () => ({ data: { signedUrl: 'https://signed' } }),
      }),
    },
  },
}));

import { saveDraft, uploadDraftPhoto, parseState, hasContent, DesignStateV1 } from './lib/designs';

const color = { name: 'Black', hex: '#000', isColorbond: true };
const state = (over: Partial<DesignStateV1> = {}): DesignStateV1 => ({
  material: 'slat_fencing', height: 1500, color, postColor: color, railCount: 3, includeChainwire: false,
  slatProfile: '65', solidPanelProfile: 'trimline', fenceScale: 1, propertyFrontage: 15,
  posts: [], segments: [], globalOffset: { x: 0, y: 0 }, background: 'none', ...over,
});

beforeEach(() => { calls.length = 0; existingDraft = null; insertError = null; uploadError = null; photoInsertError = null; photoRows = []; lookupQueue = null; });

describe('computeTargetSize', () => {
  it('scales wide photos down to 1600px, keeping the aspect ratio', () => {
    expect(computeTargetSize(4032, 3024)).toEqual({ width: 1600, height: 1200 });
    expect(computeTargetSize(3024, 4032)).toEqual({ width: 1600, height: 2133 });
  });
  it('never scales up', () => {
    expect(computeTargetSize(800, 600)).toEqual({ width: 800, height: 600 });
    expect(computeTargetSize(1600, 900)).toEqual({ width: 1600, height: 900 });
  });
});

describe('design state', () => {
  it('has content only when posts exist or an own photo is set', () => {
    expect(hasContent(state())).toBe(false);
    expect(hasContent(state({ background: 'demo' }))).toBe(false);
    expect(hasContent(state({ background: 'upload' }))).toBe(true);
    expect(hasContent(state({ posts: [{ id: 'p', x: 1, y: 2, type: 'standard' }] }))).toBe(true);
  });
  it('parses a saved state and rejects junk', () => {
    expect(parseState(state({ background: 'upload' }))?.background).toBe('upload');
    expect(parseState(null)).toBeNull();
    expect(parseState({ posts: 'x' })).toBeNull();
    expect(parseState({ posts: [], segments: [], color, postColor: color, globalOffset: 5 })?.globalOffset).toEqual({ x: 0, y: 0 });
  });
});

describe('saveDraft', () => {
  it('inserts a draft owned by the user and company when none exists', async () => {
    const id = await saveDraft('co-1', 'user-1', state());
    expect(id).toBe('new-id');
    const ins = calls.find((c) => c.op === 'insert')!;
    expect(ins.table).toBe('designs');
    expect(ins.args).toMatchObject({ company_id: 'co-1', user_id: 'user-1', is_draft: true, schema_version: 1 });
  });
  it('replaces the existing draft instead of adding a second one', async () => {
    existingDraft = { id: 'draft-9', state: {} };
    expect(await saveDraft('co-1', 'user-1', state())).toBe('draft-9');
    expect(calls.some((c) => c.op === 'insert')).toBe(false);
    expect(calls.find((c) => c.op === 'update')!.args).toMatchObject({ schema_version: 1 });
  });
  it('recovers when another tab created the draft first (unique violation)', async () => {
    insertError = { code: '23505' };
    lookupQueue = [null, { id: 'other-tab', state: {} }]; // first lookup: no draft; retry: the other tab's draft
    expect(await saveDraft('co-1', 'user-1', state())).toBe('other-tab');
    expect(calls.filter((c) => c.op === 'update')).toHaveLength(1);
  });
  it('surfaces other insert errors', async () => {
    insertError = { code: '42501' };
    await expect(saveDraft('co-1', 'user-1', state())).rejects.toBeTruthy();
  });
});

describe('uploadDraftPhoto', () => {
  const jpeg = new Blob(['x'], { type: 'image/jpeg' });
  it('uploads under <company>/<user>/ as JPEG without overwriting, then records the photo row', async () => {
    await uploadDraftPhoto('co-1', 'user-1', 'design-1', jpeg);
    const up = calls.find((c) => c.op === 'upload')!.args;
    expect(up.path).toMatch(/^co-1\/user-1\/[0-9a-f-]{36}\.jpg$/);
    expect(up.opts).toMatchObject({ contentType: 'image/jpeg', upsert: false });
    expect(calls.find((c) => c.op === 'insert' && c.table === 'photos')!.args).toMatchObject({ company_id: 'co-1', user_id: 'user-1', design_id: 'design-1', mime_type: 'image/jpeg' });
  });
  it('removes older photos of the same design after a successful upload', async () => {
    photoRows = [{ id: 'old', storage_path: 'co-1/user-1/old.jpg' }];
    await uploadDraftPhoto('co-1', 'user-1', 'design-1', jpeg);
    expect(calls.some((c) => c.op === 'remove' && JSON.stringify(c.args) === JSON.stringify(['co-1/user-1/old.jpg']))).toBe(true);
  });
  it('deletes the uploaded file if the photo row cannot be saved', async () => {
    photoInsertError = new Error('rls');
    await expect(uploadDraftPhoto('co-1', 'user-1', 'design-1', jpeg)).rejects.toThrow('rls');
    expect(calls.some((c) => c.op === 'remove')).toBe(true);
  });
  it('does not touch the database if the upload itself fails', async () => {
    uploadError = new Error('too big');
    await expect(uploadDraftPhoto('co-1', 'user-1', 'design-1', jpeg)).rejects.toThrow('too big');
    expect(calls.some((c) => c.op === 'insert')).toBe(false);
  });
});
