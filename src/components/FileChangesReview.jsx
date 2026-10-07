export default function FileChangesReview({ review, onCancel, onAccept, onToggle }) {
  if (!review) return null;
  const selected = review.files.filter((file) => file.accepted && !file.readError);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="file-review-title">
      <div className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-[var(--cl-border)] bg-[var(--cl-bg)] shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-[var(--cl-border)] px-5 py-4">
          <div>
            <h2 id="file-review-title" className="text-base font-semibold text-[var(--cl-text)]">Review file changes</h2>
            <p className="mt-1 text-xs text-[var(--cl-text-3)]">Choose which proposed files to write to the linked project folder.</p>
          </div>
          <button onClick={onCancel} className="rounded-lg px-2 py-1 text-sm text-[var(--cl-text-3)] hover:bg-[var(--cl-hover)] hover:text-[var(--cl-text)]" aria-label="Close review">✕</button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {review.files.map((file, index) => (
            <section key={`${file.path}-${index}`} className="overflow-hidden rounded-xl border border-[var(--cl-border)]">
              <div className="flex items-center gap-3 border-b border-[var(--cl-border)] bg-[var(--cl-surface)] px-3 py-2">
                <input
                  type="checkbox"
                  checked={file.accepted && !file.readError}
                  disabled={!!file.readError}
                  onChange={() => onToggle(index)}
                  aria-label={`Include ${file.path}`}
                  className="accent-[var(--cl-accent)]"
                />
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-[var(--cl-text)]">{file.path}</span>
                <span className="text-[10px] uppercase tracking-wide text-[var(--cl-text-3)]">{file.readError ? 'Cannot preview' : file.isNew ? 'New file' : 'Modified'}</span>
              </div>
              {file.readError ? (
                <p className="px-3 py-3 text-xs text-red-400">Could not read the current file: {file.readError}. This file cannot be accepted.</p>
              ) : (
                <div className="grid min-h-48 grid-cols-1 divide-y divide-[var(--cl-border)] md:grid-cols-2 md:divide-x md:divide-y-0">
                  <div className="min-w-0">
                    <p className="border-b border-[var(--cl-border)] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-red-300">Current</p>
                    <pre className="max-h-80 overflow-auto p-3 text-xs leading-relaxed text-[var(--cl-text-2)]"><code>{file.isNew ? '(file does not exist yet)' : file.original}</code></pre>
                  </div>
                  <div className="min-w-0">
                    <p className="border-b border-[var(--cl-border)] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-300">Proposed</p>
                    <pre className="max-h-80 overflow-auto p-3 text-xs leading-relaxed text-[var(--cl-text)]"><code>{file.content}</code></pre>
                  </div>
                </div>
              )}
            </section>
          ))}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--cl-border)] px-5 py-3">
          <p className="text-xs text-[var(--cl-text-3)]">{selected.length} of {review.files.length} selected</p>
          <div className="flex gap-2">
            <button onClick={onCancel} className="rounded-lg border border-[var(--cl-border)] px-3 py-2 text-xs text-[var(--cl-text-2)] hover:bg-[var(--cl-hover)]">Reject all</button>
            <button disabled={!selected.length} onClick={() => onAccept(selected)} className="rounded-lg bg-[var(--cl-accent)] px-3 py-2 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-40">Accept selected</button>
          </div>
        </footer>
      </div>
    </div>
  );
}
