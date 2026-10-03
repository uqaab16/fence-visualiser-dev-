import { supabase } from './supabase';
import { QuoteInquiry } from '../types';
import { CLIENT_CONFIG } from '../clientConfig';

function rowToQuote(row: Record<string, any>): QuoteInquiry {
  const spec = row.spec || {};
  return {
    id: row.id,
    quoteNumber: row.quote_number,
    fullName: row.customer_name,
    email: row.customer_email,
    phone: row.customer_phone,
    address: row.customer_address,
    fenceLength: spec.fenceLength ?? 0,
    totalCost: Number(row.total),
    costBreakdown: Array.isArray(row.line_items) ? row.line_items : undefined,
    message: spec.message ?? '',
    status: spec.status ?? 'pending',
    createdAt: row.created_at,
    planSummary: spec.planSummary ?? {
      material: '',
      height: 1500,
      colorName: '',
      segmentsCount: 0,
      gatesCount: 0
    }
  };
}

export async function saveQuote(
  companyId: string,
  userId: string,
  quote: QuoteInquiry
): Promise<{ id: string; quoteNumber: string } | null> {
  const quoteNumber = `${CLIENT_CONFIG.proposalIdPrefix}-${Date.now().toString().slice(-5)}`;
  const { data, error } = await supabase
    .from('quotes')
    .insert({
      company_id: companyId,
      user_id: userId,
      quote_number: quoteNumber,
      customer_name: quote.fullName,
      customer_email: quote.email,
      customer_phone: quote.phone,
      customer_address: quote.address,
      total: quote.totalCost,
      line_items: quote.costBreakdown ?? [],
      spec: {
        fenceLength: quote.fenceLength,
        message: quote.message,
        status: quote.status,
        planSummary: quote.planSummary
      }
    })
    .select('id, quote_number')
    .single();

  if (error) {
    console.error('Failed to save quote to Supabase', error);
    return null;
  }
  return { id: data.id, quoteNumber: data.quote_number };
}

export async function loadQuotes(companyId: string): Promise<QuoteInquiry[]> {
  const { data, error } = await supabase
    .from('quotes')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to load quotes from Supabase', error);
    return [];
  }
  return (data ?? []).map(rowToQuote);
}

const PHOTO_BUCKET = 'yard-photos';
const DELETE_CHUNK = 50; // keeps the request URL short
const LOCAL_ONLY_ID = /^inquiry_/; // shown after a failed save: there is no database row to delete

export interface DeleteQuotesResult {
  /** Quotes that are confirmed gone (the database returned them as deleted, or they never existed there). */
  deletedIds: string[];
  /** Quotes that are still in the database. Keep them on screen. */
  failedIds: string[];
  /** A message safe to show the user, or null when everything was deleted. */
  error: string | null;
}

async function deleteChunk(companyId: string, ids: string[]): Promise<{ deleted: string[]; error: string | null }> {
  try {
    // 1. Find the designs and photo files attached to these quotes while the rows still exist.
    const designs = await supabase.from('designs').select('id').in('quote_id', ids);
    if (designs.error) throw designs.error;
    const designIds = (designs.data ?? []).map((d) => d.id);
    if (designIds.length) {
      const photos = await supabase.from('photos').select('storage_path').in('design_id', designIds);
      if (photos.error) throw photos.error;
      const paths = (photos.data ?? []).map((p) => p.storage_path);
      // 2. Files first (SQL cannot delete them). If this fails nothing else is deleted, so the user can simply retry.
      if (paths.length) {
        const removed = await supabase.storage.from(PHOTO_BUCKET).remove(paths);
        if (removed.error) throw removed.error;
      }
    }
    // 3. One delete removes the quotes; the database cascades to their designs and photo rows (SR-44 migration).
    //    Asking for the deleted rows back is the only way to know it really happened (RLS can silently match nothing).
    const { data, error } = await supabase.from('quotes').delete().eq('company_id', companyId).in('id', ids).select('id');
    if (error) throw error;
    return { deleted: (data ?? []).map((r) => r.id), error: null };
  } catch (err) {
    console.error('Failed to delete quotes', err);
    return { deleted: [], error: 'The delete did not go through. Please check your connection and try again.' };
  }
}

/** Delete quotes (and their designs, photos and stored files). Never reports success for a row that is still there. */
export async function deleteQuotes(companyId: string | null, ids: string[]): Promise<DeleteQuotesResult> {
  const localIds = ids.filter((id) => LOCAL_ONLY_ID.test(id));
  const dbIds = ids.filter((id) => !LOCAL_ONLY_ID.test(id));
  const deleted = [...localIds];
  let error: string | null = null;

  if (dbIds.length && !companyId) {
    return { deletedIds: deleted, failedIds: dbIds, error: 'Your account is still loading. Please wait a moment and try again.' };
  }
  for (let i = 0; i < dbIds.length; i += DELETE_CHUNK) {
    const chunk = dbIds.slice(i, i + DELETE_CHUNK);
    const result = await deleteChunk(companyId as string, chunk);
    deleted.push(...result.deleted);
    if (result.error && !error) error = result.error;
  }
  const failedIds = ids.filter((id) => !deleted.includes(id));
  if (failedIds.length && !error) error = 'Some proposals could not be deleted. They may already be gone, or you may not have permission.';
  return { deletedIds: deleted, failedIds, error: failedIds.length ? error : null };
}
