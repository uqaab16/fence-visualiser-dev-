import { describe, it, expect, vi, beforeEach } from 'vitest';

// SR-44 unit tests for deleteQuotes (Supabase is mocked). The rules under test:
// files are removed BEFORE the quote rows, nothing is deleted if the file step fails, and a row is only "deleted"
// when the database hands it back as deleted.
const calls: string[] = [];
let designRows: { id: string }[] = [];
let photoRows: { storage_path: string }[] = [];
let designsError: unknown = null;
let removeError: unknown = null;
let removeThrows = false;
let quoteDeleteError: unknown = null;
let quoteDeleteReturns: ((ids: string[]) => string[]) = (ids) => ids; // which ids the database reports as deleted

function builder(table: string) {
  const state: { op: string; ids: string[] } = { op: 'select', ids: [] };
  const b: any = {
    select() { return b; },
    delete() { state.op = 'delete'; return b; },
    eq() { return b; },
    in(_col: string, ids: string[]) { state.ids = ids; return b; },
    then(res: any, rej: any) {
      let out: any;
      if (table === 'designs') { calls.push('select designs'); out = { data: designRows, error: designsError }; }
      else if (table === 'photos') { calls.push('select photos'); out = { data: photoRows, error: null }; }
      else if (state.op === 'delete') { calls.push(`delete quotes (${state.ids.length})`); out = quoteDeleteError ? { data: null, error: quoteDeleteError } : { data: quoteDeleteReturns(state.ids).map((id) => ({ id })), error: null }; }
      return Promise.resolve(out).then(res, rej);
    },
  };
  return b;
}
vi.mock('./lib/supabase', () => ({
  supabase: {
    from: (t: string) => builder(t),
    storage: { from: () => ({ remove: async (paths: string[]) => { calls.push(`remove files (${paths.length})`); if (removeThrows) throw new TypeError('Failed to fetch'); return { error: removeError }; } }) },
  },
}));

import { deleteQuotes } from './lib/quotes';

beforeEach(() => {
  calls.length = 0; designRows = []; photoRows = []; designsError = null; removeError = null; removeThrows = false;
  quoteDeleteError = null; quoteDeleteReturns = (ids) => ids; vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('deleteQuotes', () => {
  it('deletes quotes with no design without touching storage', async () => {
    const r = await deleteQuotes('co', ['q1', 'q2']);
    expect(r).toEqual({ deletedIds: ['q1', 'q2'], failedIds: [], error: null });
    expect(calls).toEqual(['select designs', 'delete quotes (2)']);
  });
  it('removes the stored photo files BEFORE deleting the quote rows', async () => {
    designRows = [{ id: 'd1' }]; photoRows = [{ storage_path: 'co/u/a.jpg' }, { storage_path: 'co/u/b.jpg' }];
    const r = await deleteQuotes('co', ['q1']);
    expect(r.failedIds).toEqual([]);
    expect(calls).toEqual(['select designs', 'select photos', 'remove files (2)', 'delete quotes (1)']);
  });
  it('deletes nothing and reports every quote as failed when the file removal fails', async () => {
    designRows = [{ id: 'd1' }]; photoRows = [{ storage_path: 'co/u/a.jpg' }]; removeError = new Error('storage down');
    const r = await deleteQuotes('co', ['q1', 'q2']);
    expect(r.deletedIds).toEqual([]);
    expect(r.failedIds).toEqual(['q1', 'q2']);
    expect(r.error).toMatch(/did not go through/);
    expect(calls.some((c) => c.startsWith('delete quotes'))).toBe(false);
  });
  it('treats a network exception during file removal as a failure, not a crash', async () => {
    designRows = [{ id: 'd1' }]; photoRows = [{ storage_path: 'x' }]; removeThrows = true;
    const r = await deleteQuotes('co', ['q1']);
    expect(r.failedIds).toEqual(['q1']);
    expect(calls.some((c) => c.startsWith('delete quotes'))).toBe(false);
  });
  it('reports failure when the quote delete errors (server error / RLS denied / network)', async () => {
    quoteDeleteError = { code: '42501', message: 'denied' };
    const r = await deleteQuotes('co', ['q1']);
    expect(r).toMatchObject({ deletedIds: [], failedIds: ['q1'] });
    expect(r.error).toBeTruthy();
  });
  it('does NOT report success when the database says nothing was deleted (RLS matched no rows)', async () => {
    quoteDeleteReturns = () => [];
    const r = await deleteQuotes('co', ['q1', 'q2']);
    expect(r.deletedIds).toEqual([]);
    expect(r.failedIds).toEqual(['q1', 'q2']);
    expect(r.error).toMatch(/could not be deleted/);
  });
  it('handles partial success honestly', async () => {
    quoteDeleteReturns = (ids) => ids.filter((id) => id !== 'q3');
    const r = await deleteQuotes('co', ['q1', 'q2', 'q3']);
    expect(r.deletedIds).toEqual(['q1', 'q2']);
    expect(r.failedIds).toEqual(['q3']);
    expect(r.error).toBeTruthy();
  });
  it('refuses with an error (and no request) when the company is not known yet', async () => {
    const r = await deleteQuotes(null, ['q1']);
    expect(r.deletedIds).toEqual([]);
    expect(r.failedIds).toEqual(['q1']);
    expect(r.error).toMatch(/still loading/);
    expect(calls).toEqual([]);
  });
  it('removes quotes that were never saved (local fallback ids) without a database request', async () => {
    const r = await deleteQuotes('co', ['inquiry_123']);
    expect(r).toEqual({ deletedIds: ['inquiry_123'], failedIds: [], error: null });
    expect(calls).toEqual([]);
  });
  it('splits large deletes into chunks and keeps going after one chunk fails', async () => {
    const ids = Array.from({ length: 120 }, (_, i) => `q${i}`);
    let n = 0;
    quoteDeleteReturns = (chunk) => (++n === 2 ? [] : chunk); // the middle chunk (50) fails
    const r = await deleteQuotes('co', ids);
    expect(calls.filter((c) => c.startsWith('delete quotes'))).toEqual(['delete quotes (50)', 'delete quotes (50)', 'delete quotes (20)']);
    expect(r.deletedIds).toHaveLength(70);
    expect(r.failedIds).toHaveLength(50);
  });
});
