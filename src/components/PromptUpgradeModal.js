import { useState, useEffect } from 'react';

export default function PromptUpgradeModal({
  isOpen,
  original,
  upgraded,
  isLoading,
  error,
  onUseUpgraded,
  onUseOriginal,
  onRetry,
  onRefine,
  onCancel,
}) {
  // The upgraded text is editable, so the user can tweak it before sending
  const [draft, setDraft] = useState('');
  useEffect(() => { setDraft(upgraded || ''); }, [upgraded]);

  if (!isOpen) return null;

  const canUse = !isLoading && !error && draft.trim().length > 0;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 md:p-8 animate-fade-in" onClick={onCancel}>
      <div
        className="bg-[var(--cl-surface-alt)] border border-[var(--cl-border-2)] w-full max-w-2xl max-h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 h-14 border-b border-[var(--cl-border)] flex-shrink-0">
          <h2 className="text-sm font-semibold text-[var(--cl-text)] tracking-tight">✨ Prompt Upgrader</h2>
          <button
            onClick={onCancel}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-[var(--cl-text-3)] hover:text-[var(--cl-text)] hover:bg-[var(--cl-hover)] transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div>
            <p className="text-xs text-[var(--cl-text-3)] font-medium uppercase tracking-wider mb-2">Original</p>
            <div className="bg-[var(--cl-bg)] border border-[var(--cl-border)] rounded-xl p-4 text-sm text-[var(--cl-text-2)] whitespace-pre-wrap leading-relaxed">
              {original}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-[var(--cl-accent)] font-medium uppercase tracking-wider">Upgraded <span className="normal-case tracking-normal text-[var(--cl-text-3)]">(you can edit it)</span></p>
              {!isLoading && !error && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => onRefine && onRefine('shorter')}
                    className="px-2.5 py-1 text-xs text-[var(--cl-text-3)] hover:text-[var(--cl-text)] rounded-lg hover:bg-[var(--cl-hover)] transition-all"
                  >
                    Shorter
                  </button>
                  <button
                    onClick={() => onRefine && onRefine('detailed')}
                    className="px-2.5 py-1 text-xs text-[var(--cl-text-3)] hover:text-[var(--cl-text)] rounded-lg hover:bg-[var(--cl-hover)] transition-all"
                  >
                    More detailed
                  </button>
                </div>
              )}
            </div>
            {isLoading ? (
              <div className="bg-[var(--cl-bg)] border border-[var(--cl-accent)]/40 rounded-xl p-4 text-sm min-h-[80px]">
                <span className="text-[var(--cl-text-3)] italic">Upgrading your prompt…</span>
              </div>
            ) : error ? (
              <div className="bg-[var(--cl-bg)] border border-red-400/40 rounded-xl p-4 text-sm min-h-[80px]">
                <span className="text-red-400">{error}</span>
              </div>
            ) : (
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && canUse) {
                    e.preventDefault();
                    onUseUpgraded(draft);
                  }
                }}
                rows={Math.min(14, Math.max(4, draft.split('\n').length + 1))}
                className="w-full bg-[var(--cl-bg)] border border-[var(--cl-accent)]/40 focus:border-[var(--cl-accent)] rounded-xl p-4 text-sm text-[var(--cl-text)] leading-relaxed resize-y outline-none transition-colors"
              />
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-4 border-t border-[var(--cl-border)] flex-shrink-0">
          <button
            onClick={onRetry}
            disabled={isLoading}
            className="px-3 py-2 text-xs text-[var(--cl-text-3)] hover:text-[var(--cl-text)] rounded-lg hover:bg-[var(--cl-hover)] transition-all disabled:opacity-30"
          >
            🔁 Retry
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onUseOriginal}
              disabled={isLoading}
              className="px-4 py-2 text-xs font-medium rounded-lg border border-[var(--cl-border-2)] text-[var(--cl-text-2)] hover:bg-[var(--cl-hover)] transition-all disabled:opacity-30"
            >
              Use Original
            </button>
            <button
              onClick={() => onUseUpgraded(draft)}
              disabled={!canUse}
              title="Ctrl+Enter"
              className="px-4 py-2 text-xs font-medium rounded-lg bg-[var(--cl-accent)] hover:bg-[var(--cl-accent-h)] text-white transition-all disabled:opacity-40"
            >
              Use Upgraded
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
