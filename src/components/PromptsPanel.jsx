import { useState, useEffect, useRef } from 'react';
import { PROMPT_GROUPS } from '../prompts';

const approxTokens = (text) => Math.ceil((text || '').length / 4);

function PromptEditor({ item, overrides, onChange, onReset, forceOpen }) {
  const edited = typeof overrides[item.key] === 'string';
  const value = edited ? overrides[item.key] : item.text;

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const draftRef = useRef(value);
  const lastCommitted = useRef(value);
  const timer = useRef(null);

  // Saves what was typed (after a short pause, when you leave the box, or when this screen closes)
  const commit = (text) => {
    lastCommitted.current = text;
    onChange(item.key, text);
  };

  // Follow outside changes (like "Reset"), but not the echo of our own typing
  useEffect(() => {
    if (value !== lastCommitted.current) {
      lastCommitted.current = value;
      draftRef.current = value;
      setDraft(value);
    }
  }, [value]);

  useEffect(() => () => {
    if (timer.current) {
      clearTimeout(timer.current);
      if (draftRef.current !== lastCommitted.current) onChange(item.key, draftRef.current);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleType = (text) => {
    setDraft(text);
    draftRef.current = text;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { timer.current = null; commit(text); }, 600);
  };

  const handleBlur = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (draftRef.current !== lastCommitted.current) commit(draftRef.current);
  };

  const handleReset = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    onReset(item.key);
  };

  const isOpen = open || forceOpen;
  const missing = (item.vars || []).filter((v) => !draft.includes(`{{${v}}}`));

  return (
    <div className="bg-[var(--cl-bg)] border border-[var(--cl-border)] rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--cl-hover)] transition-colors"
      >
        <span className="text-[var(--cl-text-3)] text-xs w-3 flex-shrink-0">{isOpen ? '▾' : '▸'}</span>
        <span className="flex-1 min-w-0 text-sm text-[var(--cl-text)] truncate">{item.title}</span>
        {edited && <span className="text-xs text-[var(--cl-accent)] bg-[var(--cl-accent)]/10 px-2 py-0.5 rounded-md flex-shrink-0">edited</span>}
        {draft.trim() === '' && <span className="text-xs text-yellow-400 flex-shrink-0">off</span>}
        <span className="text-xs text-[var(--cl-text-3)] flex-shrink-0">~{approxTokens(draft)} tokens</span>
      </button>

      {isOpen && (
        <div className="px-4 pb-4 space-y-3 border-t border-[var(--cl-border)] pt-3">
          {(item.desc || item.note) && (
            <p className="text-xs text-[var(--cl-text-3)] leading-relaxed">{[item.desc, item.note].filter(Boolean).join(' ')}</p>
          )}

          {item.vars && item.vars.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-[var(--cl-text-3)]">Selene fills in:</span>
              {item.vars.map((v) => (
                <span key={v} className="text-xs font-mono px-1.5 py-0.5 rounded bg-[var(--cl-surface)] border border-[var(--cl-border-2)] text-[var(--cl-text-2)]">{`{{${v}}}`}</span>
              ))}
            </div>
          )}

          <textarea
            value={draft}
            onChange={(e) => handleType(e.target.value)}
            onBlur={handleBlur}
            spellCheck={false}
            rows={Math.min(18, Math.max(3, draft.split('\n').length + 1))}
            placeholder="Empty: this part is left out"
            className="w-full bg-[var(--cl-surface)] border border-[var(--cl-border-2)] focus:border-[var(--cl-accent)]/50 rounded-lg p-3 text-xs text-[var(--cl-text)] font-mono leading-relaxed resize-y outline-none transition-colors"
          />

          {missing.length > 0 && draft.trim() !== '' && (
            <p className="text-xs text-yellow-400 leading-relaxed">
              This text does not use {missing.map((v) => `{{${v}}}`).join(', ')}, so that information is left out.
            </p>
          )}

          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--cl-text-3)]">Empty text switches this part off.</span>
            <button
              onClick={handleReset}
              disabled={!edited}
              className="px-3 py-1.5 text-xs rounded-lg border border-[var(--cl-border-2)] text-[var(--cl-text-2)] hover:bg-[var(--cl-hover)] hover:text-[var(--cl-text)] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Reset to default
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PromptsPanel({ promptOverrides, onChange, onReset, onResetAll }) {
  const [query, setQuery] = useState('');
  const [confirmAll, setConfirmAll] = useState(false);

  useEffect(() => {
    if (!confirmAll) return undefined;
    const t = setTimeout(() => setConfirmAll(false), 4000);
    return () => clearTimeout(t);
  }, [confirmAll]);

  const editedCount = PROMPT_GROUPS.reduce((n, g) => n + g.items.filter((it) => typeof promptOverrides[it.key] === 'string').length, 0);
  const q = query.trim().toLowerCase();
  const matches = (it) => !q
    || it.title.toLowerCase().includes(q)
    || it.key.toLowerCase().includes(q)
    || (typeof promptOverrides[it.key] === 'string' ? promptOverrides[it.key] : it.text).toLowerCase().includes(q);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h3 className="text-lg font-medium text-[var(--cl-text)]">Prompts</h3>
        <p className="text-sm text-[var(--cl-text-3)] mt-1 leading-relaxed">
          Everything Selene is told behind the scenes, in one place. Open any prompt to read it and change it. Changes work from your next message.
          Your own custom prompt (Prompt System) is added in front of all of these.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search prompts…"
          className="flex-1 bg-[var(--cl-surface)] border border-[var(--cl-border-2)] rounded-lg px-3 py-2 text-sm text-[var(--cl-text)] placeholder-[var(--cl-text-3)] focus:outline-none focus:border-[var(--cl-accent)]/50 transition-colors"
        />
        <button
          onClick={() => { if (confirmAll) { setConfirmAll(false); onResetAll(); } else setConfirmAll(true); }}
          disabled={editedCount === 0}
          className={`px-3 py-2 text-xs rounded-lg border transition-all flex-shrink-0 disabled:opacity-30 disabled:cursor-not-allowed ${
            confirmAll
              ? 'border-red-400/50 bg-red-500/15 text-red-400'
              : 'border-[var(--cl-border-2)] text-[var(--cl-text-2)] hover:bg-[var(--cl-hover)]'
          }`}
        >
          {confirmAll ? 'Click again to reset all' : `Reset all${editedCount ? ` (${editedCount})` : ''}`}
        </button>
      </div>

      {PROMPT_GROUPS.map((g) => {
        const items = g.items.filter(matches);
        if (items.length === 0) return null;
        return (
          <div key={g.id} className="space-y-2">
            <div>
              <p className="text-xs text-[var(--cl-text-3)] font-medium uppercase tracking-wider">{g.title}</p>
              {g.note && <p className="text-xs text-[var(--cl-text-3)] mt-0.5">{g.note}</p>}
            </div>
            {items.map((it) => (
              <PromptEditor
                key={it.key}
                item={it}
                overrides={promptOverrides}
                onChange={onChange}
                onReset={onReset}
                forceOpen={!!q && items.length <= 2}
              />
            ))}
          </div>
        );
      })}

      {q && PROMPT_GROUPS.every((g) => g.items.filter(matches).length === 0) && (
        <p className="text-sm text-[var(--cl-text-3)]">No prompt matches "{query}".</p>
      )}

      <p className="text-xs text-[var(--cl-text-3)] leading-relaxed">
        Tips: every token you add here is sent with every message, so shorter prompts save tokens. The tool descriptions (what each tool does) are not
        listed here. If a model behaves strangely after an edit, use "Reset to default".
      </p>
    </div>
  );
}
