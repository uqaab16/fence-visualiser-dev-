import { supabase } from './supabase';
import type { Post, Segment, ColorOption, FenceMaterial, FenceHeight } from '../types';

// SR-08: draft designs and their property photo. One draft per user (unique index `designs_one_draft_per_user`);
// the whole canvas is one versioned JSON `state`. Photos live in the private `yard-photos` bucket under `<company_id>/<user_id>/`.

export const DESIGN_SCHEMA_VERSION = 1;
const BUCKET = 'yard-photos';
const SIGNED_URL_SECONDS = 6 * 60 * 60;

export interface DesignStateV1 {
  material: FenceMaterial;
  height: FenceHeight;
  color: ColorOption;
  postColor: ColorOption;
  railCount: 2 | 3 | 4;
  includeChainwire: boolean;
  slatProfile: '65' | '90';
  solidPanelProfile: 'sawtooth' | 'trimline';
  fenceScale: number;
  propertyFrontage: number;
  posts: Post[];
  segments: Segment[];
  globalOffset: { x: number; y: number };
  /** none: no picture, demo: the built-in demo yard, upload: the contractor's own photo (stored in `photos`) */
  background: 'none' | 'demo' | 'upload';
}

export interface LoadedDraft {
  designId: string;
  state: DesignStateV1;
  photoUrl: string | null;
}

export function hasContent(state: DesignStateV1): boolean {
  return state.posts.length > 0 || state.background === 'upload';
}

/** Defensive parse: returns null for anything this app version cannot restore. */
export function parseState(raw: unknown): DesignStateV1 | null {
  const s = raw as Partial<DesignStateV1> | null;
  if (!s || typeof s !== 'object' || !Array.isArray(s.posts) || !Array.isArray(s.segments) || !s.color || !s.postColor) return null;
  return {
    material: s.material as FenceMaterial,
    height: s.height as FenceHeight,
    color: s.color,
    postColor: s.postColor,
    railCount: (s.railCount ?? 3) as 2 | 3 | 4,
    includeChainwire: !!s.includeChainwire,
    slatProfile: s.slatProfile === '90' ? '90' : '65',
    solidPanelProfile: s.solidPanelProfile === 'sawtooth' ? 'sawtooth' : 'trimline',
    fenceScale: typeof s.fenceScale === 'number' ? s.fenceScale : 1,
    propertyFrontage: typeof s.propertyFrontage === 'number' ? s.propertyFrontage : 15,
    posts: s.posts,
    segments: s.segments,
    globalOffset: s.globalOffset && typeof s.globalOffset.x === 'number' ? s.globalOffset : { x: 0, y: 0 },
    background: s.background === 'upload' || s.background === 'demo' ? s.background : 'none',
  };
}

async function getDraftRow(userId: string): Promise<{ id: string; state: unknown } | null> {
  const { data, error } = await supabase
    .from('designs')
    .select('id, state')
    .eq('user_id', userId)
    .eq('is_draft', true)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Create or replace the user's single draft. Returns the design id. */
export async function saveDraft(companyId: string, userId: string, state: DesignStateV1): Promise<string> {
  const fields = {
    state,
    schema_version: DESIGN_SCHEMA_VERSION,
    material: state.material,
    height: state.height,
    updated_at: new Date().toISOString(),
  };
  const update = async (id: string) => {
    const { error } = await supabase.from('designs').update(fields).eq('id', id);
    if (error) throw error;
    return id;
  };
  const existing = await getDraftRow(userId);
  if (existing) return update(existing.id);
  const { data, error } = await supabase
    .from('designs')
    .insert({ company_id: companyId, user_id: userId, name: 'Draft', is_draft: true, ...fields })
    .select('id')
    .single();
  if (error) {
    if ((error as { code?: string }).code === '23505') { // another tab created the draft first
      const again = await getDraftRow(userId);
      if (again) return update(again.id);
    }
    throw error;
  }
  return data.id;
}

async function removePhotos(designId: string, keepPath?: string): Promise<void> {
  const { data } = await supabase.from('photos').select('id, storage_path').eq('design_id', designId);
  const old = (data ?? []).filter((p) => p.storage_path !== keepPath);
  if (!old.length) return;
  await supabase.from('photos').delete().in('id', old.map((p) => p.id));
  await supabase.storage.from(BUCKET).remove(old.map((p) => p.storage_path));
}

/** Upload an already-shrunk JPEG for the draft, then drop any earlier photo of the same design. */
export async function uploadDraftPhoto(companyId: string, userId: string, designId: string, jpeg: Blob): Promise<string> {
  const path = `${companyId}/${userId}/${crypto.randomUUID()}.jpg`;
  const up = await supabase.storage.from(BUCKET).upload(path, jpeg, { contentType: 'image/jpeg', upsert: false });
  if (up.error) throw up.error;
  const ins = await supabase.from('photos').insert({
    company_id: companyId, user_id: userId, design_id: designId,
    storage_path: path, file_name: 'property.jpg', mime_type: 'image/jpeg', size_bytes: jpeg.size,
  });
  if (ins.error) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw ins.error;
  }
  await removePhotos(designId, path);
  return path;
}

export async function removeDraftPhoto(designId: string): Promise<void> {
  await removePhotos(designId);
}

export async function loadDraft(userId: string): Promise<LoadedDraft | null> {
  const row = await getDraftRow(userId);
  if (!row) return null;
  const state = parseState(row.state);
  if (!state) return null;
  let photoUrl: string | null = null;
  if (state.background === 'upload') {
    const { data } = await supabase.from('photos').select('storage_path').eq('design_id', row.id).order('created_at', { ascending: false }).limit(1);
    const path = data?.[0]?.storage_path;
    if (path) {
      const signed = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS);
      photoUrl = signed.data?.signedUrl ?? null;
    }
  }
  return { designId: row.id, state: photoUrl || state.background !== 'upload' ? state : { ...state, background: 'none' }, photoUrl };
}

export async function discardDraft(userId: string): Promise<void> {
  const row = await getDraftRow(userId);
  if (!row) return;
  await removePhotos(row.id);
  const { error } = await supabase.from('designs').delete().eq('id', row.id);
  if (error) throw error;
}

/** Turn the user's draft into a final design attached to a saved quote. */
export async function finalizeDraft(userId: string, quoteId: string): Promise<void> {
  const { error } = await supabase
    .from('designs')
    .update({ is_draft: false, quote_id: quoteId, name: 'Quote design', updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('is_draft', true);
  if (error) throw error;
}
