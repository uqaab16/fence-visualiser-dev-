import React, { useEffect } from 'react';

// SR-44: in-app confirmation for destructive deletes (same look as Reset Design / Clear Canvas in FenceCanvas).
// While `busy` both buttons are disabled so a delete cannot be sent twice; `error` stays visible so the user can retry.
interface Props {
  title: string;
  children: React.ReactNode;
  confirmLabel: string;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDeleteModal({ title, children, confirmLabel, busy, error, onConfirm, onCancel }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onCancel]);

  return (
    <div className="fixed inset-0 bg-[#1a1c1e]/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
      <div role="alertdialog" aria-modal="true" aria-label={title} className="bg-white border border-[#cfc8b8] w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl">
        <div className="px-6 pt-6 pb-2">
          <h2 className="text-base font-bold text-[#1a1c1e] mb-2">{title}</h2>
          <p className="text-sm text-[#5f6266] leading-relaxed">{children}</p>
          {error && (
            <p role="alert" className="mt-3 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 leading-relaxed">{error}</p>
          )}
        </div>
        <div className="flex gap-2 px-6 py-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="flex-1 px-4 py-2.5 bg-[#f3efe6] hover:bg-[#ece7db] border border-[#d9d3c5] text-[#1a1c1e] font-bold rounded-xl text-sm transition cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="flex-1 px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl text-sm transition cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {busy ? 'Deleting…' : error ? 'Try again' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
