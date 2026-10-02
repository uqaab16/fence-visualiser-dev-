import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DesignStateV1, hasContent, saveDraft, uploadDraftPhoto, removeDraftPhoto, discardDraft } from '../lib/designs';
import { shrinkImage } from '../lib/imageShrink';

// SR-08: debounced autosave of the user's single draft design. Saves ~2s after the last change, never in parallel,
// and never before the restore/discard question has been answered (so an empty canvas cannot overwrite a saved draft).
const DEBOUNCE_MS = 2000;

export type DraftStatus = 'idle' | 'saving' | 'saved' | 'error';

interface Options {
  companyId: string | null;
  userId: string | null;
  enabled: boolean;
  state: DesignStateV1;
  /** The picture currently on the canvas (a data: URL for a fresh upload, a signed https URL for a restored one). */
  photoSrc: string;
}

export function useDraftAutosave({ companyId, userId, enabled, state, photoSrc }: Options) {
  const [status, setStatus] = useState<DraftStatus>('idle');
  const latest = useRef({ companyId, userId, state, photoSrc });
  latest.current = { companyId, userId, state, photoSrc };

  const designId = useRef<string | null>(null);
  const storedSrc = useRef<string | null>(null); // the photoSrc whose photo is already in storage
  const failedSrc = useRef<string | null>(null); // a photo that could not be shrunk/uploaded: do not retry on every edit
  const lastSaved = useRef('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chain = useRef<Promise<void>>(Promise.resolve());

  const stateJson = useMemo(() => JSON.stringify(state), [state]);

  const runSave = useCallback(async () => {
    const { companyId, userId, state, photoSrc } = latest.current;
    if (!companyId || !userId) return;
    const signature = JSON.stringify(state) + '|' + photoSrc.length + photoSrc.slice(-24);
    if (signature === lastSaved.current) return;

    if (!hasContent(state)) {
      if (designId.current) await discardDraft(userId); // canvas was cleared
      designId.current = null; storedSrc.current = null; lastSaved.current = signature;
      return;
    }
    setStatus('saving');
    const id = await saveDraft(companyId, userId, state);
    designId.current = id;
    if (state.background === 'upload') {
      if (photoSrc.startsWith('data:') && storedSrc.current !== photoSrc && failedSrc.current !== photoSrc) {
        try {
          const jpeg = await shrinkImage(await (await fetch(photoSrc)).blob());
          await uploadDraftPhoto(companyId, userId, id, jpeg);
          storedSrc.current = photoSrc;
        } catch (err) {
          failedSrc.current = photoSrc;
          console.error('Draft photo was not saved', err);
          setStatus('error');
          lastSaved.current = signature;
          return;
        }
      }
    } else if (storedSrc.current) {
      await removeDraftPhoto(id);
      storedSrc.current = null;
    }
    lastSaved.current = signature;
    setStatus('saved');
  }, []);

  const enqueue = useCallback(() => {
    chain.current = chain.current.then(runSave).catch((err) => {
      console.error('Draft autosave failed', err);
      setStatus('error');
    });
    return chain.current;
  }, [runSave]);

  useEffect(() => {
    if (!enabled) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { timer.current = null; void enqueue(); }, DEBOUNCE_MS);
    return () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };
  }, [enabled, stateJson, photoSrc, enqueue]);

  // Phones often kill background tabs without warning: save as soon as the page is hidden.
  useEffect(() => {
    if (!enabled) return;
    const onHide = () => { if (document.visibilityState === 'hidden') { if (timer.current) clearTimeout(timer.current); void enqueue(); } };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [enabled, enqueue]);

  /** Save right now (used before a quote is submitted). */
  const flush = useCallback(async () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    await enqueue();
  }, [enqueue]);

  /** A saved draft was loaded onto the canvas: treat it as already saved. */
  const adopt = useCallback((id: string, src: string, restored: DesignStateV1) => {
    designId.current = id;
    storedSrc.current = src || null;
    failedSrc.current = null;
    lastSaved.current = JSON.stringify(restored) + '|' + src.length + src.slice(-24);
    setStatus('saved');
  }, []);

  /** The draft became a final quote design: the next change starts a new draft. */
  const reset = useCallback(() => {
    designId.current = null; storedSrc.current = null; failedSrc.current = null; lastSaved.current = '';
    setStatus('idle');
  }, []);

  return { status, flush, adopt, reset };
}
