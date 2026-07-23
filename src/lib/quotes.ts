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

export async function deleteAllQuotes(companyId: string): Promise<void> {
  const { error } = await supabase
    .from('quotes')
    .delete()
    .eq('company_id', companyId);

  if (error) {
    console.error('Failed to delete quotes from Supabase', error);
  }
}
