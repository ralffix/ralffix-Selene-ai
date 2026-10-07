import { useState, useEffect, useRef, useCallback } from 'react';
import { searchModels, listGgufFiles } from '../modeldownload';
import { formatSize } from '../ollama';

const SORTS = [
  { value: 'downloads', label: 'Most downloaded' },
  { value: 'likes', label: 'Most liked' },
  { value: 'lastModified', label: 'Newest' },
];

function fmtCount(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(n);
}

export default function ModelBrowser({ local, onUseModel }) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('downloads');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [repo, setRepo] = useState(null); // opened model, e.g. "bartowski/Qwen3-8B-GGUF"
  const [files, setFiles] = useState(null);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesError, setFilesError] = useState('');

  const seq = useRef(0);

  const runSearch = useCallback(async (q, s) => {
    const mine = ++seq.current;
    setLoading(true);
    setError('');
    try {
      const list = await searchModels(q, s);
      if (mine === seq.current) setResults(list);
    } catch (e) {
      if (mine === seq.current) setError(String((e && e.message) || e));
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, []);

  // Show the popular models when the tab opens
  useEffect(() => { runSearch('', 'downloads'); }, [runSearch]);

  const openRepo = async (id) => {
    setRepo(id);
    setFiles(null);
    setFilesError('');
    setFilesLoading(true);
    try {
      setFiles(await listGgufFiles(id));
    } catch (e) {
      setFilesError(String((e && e.message) || e));
    } finally {
      setFilesLoading(false);
    }
  };

  // ── One model opened: its files ──
  if (repo) {
    const folder = repo.replace('/', '__');
    return (
      <div className="p-6 space-y-5">
        <button
          onClick={() => setRepo(null)}
          className="text-xs text-[var(--cl-text-3)] hover:text-[var(--cl-text)] transition-colors"
        >
          ← Back to results
        </button>

        <div>
          <h3 className="text-lg font-medium text-[var(--cl-text)] break-all">{repo}</h3>
          <p className="text-sm text-[var(--cl-text-3)] mt-1">
            Pick one file. The file size is about how much GPU memory (or RAM) it needs, so choose one that fits your computer.
            Q4_K_M is a good balance of size and quality.
          </p>
        </div>

        {filesLoading && <p className="text-sm text-[var(--cl-text-3)] italic">Loading files…</p>}
        {filesError && (
          <div className="text-xs text-red-400 bg-red-400/10 border border-red-400/30 rounded-lg px-3 py-2 break-words">{filesError}</div>
        )}
        {files && files.length === 0 && (
          <p className="text-sm text-[var(--cl-text-3)]">No .gguf model files found in this repository.</p>
        )}

        {files && files.length > 0 && (
          <div className="space-y-2">
            {files.map((g) => {
              const key = `${repo}::${g.id}`;
              const dl = local.downloads[key];
              const firstBase = g.parts[0].path.split('/').pop();
              const installed = local.models.find((m) => m.path.endsWith(`${folder}/${firstBase}`));
              const pct = dl && dl.total ? Math.min(100, Math.round((dl.done / dl.total) * 100)) : 0;
              return (
                <div key={g.id} className="bg-[var(--cl-bg)] border border-[var(--cl-border)] rounded-xl px-4 py-3 space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {g.quant && (
                          <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-[var(--cl-accent)]/10 text-[var(--cl-accent)]">{g.quant}</span>
                        )}
                        {g.quant === 'Q4_K_M' && <span className="text-xs text-[var(--cl-text-3)]">recommended</span>}
                        {g.parts.length > 1 && <span className="text-xs text-[var(--cl-text-3)]">{g.parts.length} parts</span>}
                      </div>
                      <p className="text-xs text-[var(--cl-text-3)] font-mono truncate mt-1" title={g.name}>{g.name}</p>
                    </div>
                    <span className="text-sm text-[var(--cl-text)] flex-shrink-0">{formatSize(g.size)}</span>

                    {installed ? (
                      <button
                        onClick={() => onUseModel(installed.name)}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--cl-border-2)] text-[var(--cl-text-2)] hover:bg-[var(--cl-hover)] hover:text-[var(--cl-text)] transition-all flex-shrink-0"
                      >
                        Installed · Use
                      </button>
                    ) : dl && dl.status === 'downloading' ? (
                      <button
                        onClick={() => local.cancelDownload(key)}
                        className="px-3 py-1.5 text-xs rounded-lg border border-[var(--cl-border-2)] text-[var(--cl-text-2)] hover:bg-[var(--cl-hover)] transition-all flex-shrink-0"
                      >
                        Cancel
                      </button>
                    ) : (
                      <button
                        onClick={() => local.startDownload(repo, g)}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[var(--cl-accent)] hover:bg-[var(--cl-accent-h)] text-white transition-all flex-shrink-0"
                      >
                        {dl && dl.status === 'error' ? 'Try again' : 'Install'}
                      </button>
                    )}
                  </div>

                  {dl && dl.status === 'downloading' && (
                    <div className="space-y-1">
                      <div className="h-1.5 rounded-full bg-[var(--cl-border)] overflow-hidden">
                        <div className="h-full bg-[var(--cl-accent)] transition-all duration-500" style={{ width: `${pct}%` }} />
                      </div>
                      <p className="text-xs text-[var(--cl-text-3)]">{formatSize(dl.done) || '0 MB'} of {formatSize(dl.total)} · {pct}%</p>
                    </div>
                  )}
                  {dl && dl.status === 'error' && (
                    <p className="text-xs text-red-400 break-words">{dl.error}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <p className="text-xs text-[var(--cl-text-3)] leading-relaxed">
          Downloads keep going if you close Settings, and a stopped download continues where it left off. When it finishes, the model is added to your list automatically.
        </p>
      </div>
    );
  }

  // ── Search ──
  return (
    <div className="p-6 space-y-5">
      <div>
        <h3 className="text-lg font-medium text-[var(--cl-text)]">Find models</h3>
        <p className="text-sm text-[var(--cl-text-3)] mt-1">
          Search Hugging Face for models in the GGUF format, then install one with a click. Try a name like "qwen", "llama", "gemma" or "coder".
        </p>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') runSearch(query, sort); }}
          placeholder="Search models…"
          className="flex-1 bg-[var(--cl-surface)] border border-[var(--cl-border-2)] rounded-lg px-3 py-2 text-sm text-[var(--cl-text)] placeholder-[var(--cl-text-3)] focus:outline-none focus:border-[var(--cl-accent)]/50 transition-colors"
        />
        <button
          onClick={() => runSearch(query, sort)}
          className="px-4 py-2 text-sm bg-[var(--cl-accent)] hover:bg-[var(--cl-accent-h)] text-white rounded-lg transition-all flex-shrink-0"
        >
          Search
        </button>
      </div>

      <div className="inline-flex rounded-lg border border-[var(--cl-border-2)] overflow-hidden">
        {SORTS.map((s) => (
          <button
            key={s.value}
            onClick={() => { setSort(s.value); runSearch(query, s.value); }}
            className={`px-3 py-1.5 text-xs transition-colors ${
              sort === s.value
                ? 'bg-[var(--cl-accent)]/15 text-[var(--cl-accent)]'
                : 'text-[var(--cl-text-3)] hover:text-[var(--cl-text)] hover:bg-[var(--cl-hover)]'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="text-xs text-red-400 bg-red-400/10 border border-red-400/30 rounded-lg px-3 py-2 break-words">{error}</div>
      )}
      {loading && <p className="text-sm text-[var(--cl-text-3)] italic">Searching…</p>}
      {!loading && results && results.length === 0 && !error && (
        <p className="text-sm text-[var(--cl-text-3)]">No models found. Try a different word.</p>
      )}

      {results && results.length > 0 && (
        <div className="space-y-1.5">
          {results.map((m) => {
            const [owner, ...rest] = m.id.split('/');
            const name = rest.join('/');
            return (
              <button
                key={m.id}
                onClick={() => openRepo(m.id)}
                className="w-full text-left flex items-center gap-3 px-4 py-2.5 rounded-xl border border-[var(--cl-border)] bg-[var(--cl-bg)] hover:bg-[var(--cl-hover)] transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[var(--cl-text)] truncate">{name || owner}</p>
                  {name && <p className="text-xs text-[var(--cl-text-3)] truncate">{owner}</p>}
                </div>
                <span className="text-xs text-[var(--cl-text-3)] flex-shrink-0">↓ {fmtCount(m.downloads)}</span>
                <span className="text-xs text-[var(--cl-text-3)] flex-shrink-0">♥ {fmtCount(m.likes)}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
