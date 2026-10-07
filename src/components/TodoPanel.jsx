// Right-side panel that shows the to-do list Selene keeps for the current chat.

function CloseIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </svg>
  );
}

function StatusIcon({ status }) {
  if (status === 'done') {
    return (
      <svg className="w-4 h-4 text-[var(--cl-accent)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" fill="currentColor" fillOpacity="0.15" />
        <polyline points="8 12.5 11 15.5 16 9.5" />
      </svg>
    );
  }
  if (status === 'in_progress') {
    return (
      <svg className="w-4 h-4 text-[var(--cl-accent)] animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <circle cx="12" cy="12" r="9" strokeOpacity="0.25" />
        <path d="M21 12a9 9 0 0 0-9-9" />
      </svg>
    );
  }
  return (
    <svg className="w-4 h-4 text-[var(--cl-text-3)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
    </svg>
  );
}

export default function TodoPanel({ items, onClose, onClear, onToggle }) {
  const done = items.filter((t) => t.status === 'done').length;
  const pct = items.length ? Math.round((done / items.length) * 100) : 0;

  return (
    <aside className="w-[280px] flex-shrink-0 border-l border-[var(--cl-border)] bg-[var(--cl-sidebar)] flex flex-col min-h-0 animate-fade-in">
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div>
          <p className="text-sm font-semibold text-[var(--cl-text)]">To-do list</p>
          <p className="text-xs text-[var(--cl-text-3)]">{done} of {items.length} done</p>
        </div>
        <button
          onClick={onClose}
          title="Hide"
          className="p-1.5 rounded-md text-[var(--cl-text-3)] hover:text-[var(--cl-text)] hover:bg-[var(--cl-hover)] transition-colors"
        >
          <CloseIcon />
        </button>
      </div>

      <div className="px-4 pb-3">
        <div className="h-1.5 rounded-full bg-[var(--cl-border)] overflow-hidden">
          <div className="h-full bg-[var(--cl-accent)] transition-all duration-300" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <ul className="flex-1 min-h-0 overflow-y-auto px-2 pb-2 space-y-0.5">
        {items.map((t) => (
          <li
            key={t.id}
            onClick={() => onToggle && onToggle(t.id)}
            title="Click to tick or untick"
            className="flex items-start gap-2.5 px-2 py-1.5 rounded-lg cursor-pointer hover:bg-[var(--cl-hover)] transition-colors"
          >
            <span className="mt-0.5 flex-shrink-0"><StatusIcon status={t.status} /></span>
            <span
              className={`text-sm leading-snug break-words ${
                t.status === 'done'
                  ? 'text-[var(--cl-text-3)] line-through'
                  : t.status === 'in_progress'
                    ? 'text-[var(--cl-text)] font-medium'
                    : 'text-[var(--cl-text-2)]'
              }`}
            >
              {t.text}
            </span>
          </li>
        ))}
      </ul>

      <div className="p-3 border-t border-[var(--cl-border)]">
        <button
          onClick={onClear}
          className="w-full text-xs text-[var(--cl-text-3)] hover:text-red-400 py-1.5 rounded-lg hover:bg-red-400/10 transition-colors"
        >
          Clear list
        </button>
      </div>
    </aside>
  );
}
