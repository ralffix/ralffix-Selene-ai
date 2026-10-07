import { useState, useEffect, useRef } from 'react';
import { pullOllamaModel, deleteOllamaModel, formatSize } from '../ollama';

const SUGGESTED = ['llama3.2:3b', 'qwen3:8b', 'mistral', 'gemma3:4b', 'qwen2.5-coder:7b'];

export default function OllamaPanel({ ollama, baseUrl, activeProvider, activeModel, onRefresh, onUseModel, connected, onConnect }) {
  const [pullName, setPullName] = useState('');
  const [pulling, setPulling] = useState(null); // name being downloaded
  const [progress, setProgress] = useState(null); // { status, pct }
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [starting, setStarting] = useState(false);
  const abortRef = useRef(null);

  // Look again whenever this tab opens
  useEffect(() => { onRefresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!confirmDelete) return undefined;
    const t = setTimeout(() => setConfirmDelete(null), 4000);
    return () => clearTimeout(t);
  }, [confirmDelete]);

  useEffect(() => () => { if (abortRef.current) abortRef.current.abort(); }, []);

  const startOllama = async () => {
    setStarting(true);
    setError('');
    try {
      if (!window.__TAURI_INTERNALS__) throw new Error('Starting Ollama only works in the desktop app. Run "ollama serve" in a terminal instead.');
      const { Command } = await import('@tauri-apps/plugin-shell');
      await Command.create('run-script', ['-c', 'nohup ollama serve >/dev/null 2>&1 &']).execute();
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 700));
        if (await onRefresh()) break;
      }
    } catch (e) {
      setError(String((e && e.message) || e));
    } finally {
      setStarting(false);
    }
  };

  const startPull = async (name) => {
    const n = String(name || '').trim();
    if (!n || pulling) return;
    setPulling(n);
    setError('');
    setProgress({ status: 'starting', pct: null });
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      await pullOllamaModel(baseUrl, n, (p) => {
        setProgress({ status: p.status, pct: p.total ? Math.round(((p.completed || 0) / p.total) * 100) : null });
      }, ctrl.signal);
      setPullName('');
      await onRefresh();
    } catch (e) {
      if (!e || e.name !== 'AbortError') setError(String((e && e.message) || e));
    } finally {
      setPulling(null);
      setProgress(null);
      abortRef.current = null;
    }
  };

  const removeModel = async (name) => {
    if (confirmDelete !== name) { setConfirmDelete(name); return; }
    setConfirmDelete(null);
    setError('');
    try {
      await deleteOllamaModel(baseUrl, name);
      await onRefresh();
    } catch (e) {
      setError(String((e && e.message) || e));
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h3 className="text-lg font-medium text-[var(--cl-text)]">Local models</h3>
        <p className="text-sm text-[var(--cl-text-3)] mt-1">
          Run AI models on your own computer with Ollama. They are free, private and work offline. Pick one in the model menu at the top.
        </p>
      </div>

      {/* Status */}
      <div className="bg-[var(--cl-bg)] border border-[var(--cl-border)] rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${ollama.online ? 'bg-green-400' : 'bg-red-400'}`} />
            <div className="min-w-0">
              <p className="text-sm font-medium text-[var(--cl-text)]">{ollama.online ? 'Ollama is running' : 'Ollama is not running'}</p>
              <p className="text-xs text-[var(--cl-text-3)] font-mono truncate">{baseUrl}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {ollama.online && !connected && (
              <button
                onClick={onConnect}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[var(--cl-accent)] hover:bg-[var(--cl-accent-h)] text-white transition-all"
              >
                Add to model menu
              </button>
            )}
            {!ollama.online && (
              <button
                onClick={startOllama}
                disabled={starting}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[var(--cl-accent)] hover:bg-[var(--cl-accent-h)] text-white transition-all disabled:opacity-50"
              >
                {starting ? 'Starting…' : 'Start Ollama'}
              </button>
            )}
            <button
              onClick={() => onRefresh()}
              className="px-3 py-1.5 text-xs text-[var(--cl-text-3)] hover:text-[var(--cl-text)] rounded-lg hover:bg-[var(--cl-hover)] transition-all"
            >
              Refresh
            </button>
          </div>
        </div>
        {!ollama.online && (
          <p className="text-xs text-[var(--cl-text-3)] leading-relaxed border-t border-[var(--cl-border)] pt-3">
            Not installed yet? Get it from ollama.com (on Arch: <span className="font-mono">sudo pacman -S ollama</span>). You can also start it yourself
            with <span className="font-mono">ollama serve</span> or <span className="font-mono">systemctl start ollama</span>.
          </p>
        )}
      </div>

      {error && (
        <div className="text-xs text-red-400 bg-red-400/10 border border-red-400/30 rounded-lg px-3 py-2 break-words">{error}</div>
      )}

      {/* Installed models */}
      <div className="bg-[var(--cl-bg)] border border-[var(--cl-border)] rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs text-[var(--cl-text-3)] font-medium uppercase tracking-wider">Installed models</p>
          <span className="text-xs text-[var(--cl-text-3)]">{ollama.models.length}</span>
        </div>
        {ollama.models.length === 0 ? (
          <p className="text-xs text-[var(--cl-text-3)] text-center py-5 leading-relaxed">
            {ollama.online ? 'No models yet. Download one below.' : 'Start Ollama to see your models.'}
          </p>
        ) : (
          <div className="space-y-1">
            {ollama.models.map((m) => {
              const inUse = activeProvider === 'ollama' && activeModel === m.name;
              return (
                <div key={m.name} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-[var(--cl-hover)] transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[var(--cl-text)] font-mono truncate">{m.name}</p>
                    {m.size > 0 && <p className="text-xs text-[var(--cl-text-3)]">{formatSize(m.size)}</p>}
                  </div>
                  {inUse ? (
                    <span className="text-xs text-[var(--cl-accent)] bg-[var(--cl-accent)]/10 px-2 py-0.5 rounded-md">In use</span>
                  ) : (
                    <button
                      onClick={() => onUseModel(m.name)}
                      className="px-3 py-1 text-xs rounded-lg border border-[var(--cl-border-2)] text-[var(--cl-text-2)] hover:bg-[var(--cl-hover)] hover:text-[var(--cl-text)] transition-all"
                    >
                      Use
                    </button>
                  )}
                  <button
                    onClick={() => removeModel(m.name)}
                    title="Delete model"
                    className={`px-2 py-1 text-xs rounded-lg transition-all ${
                      confirmDelete === m.name
                        ? 'bg-red-500/15 text-red-400'
                        : 'text-[var(--cl-text-3)] hover:text-red-400 hover:bg-red-400/10'
                    }`}
                  >
                    {confirmDelete === m.name ? 'Click again to delete' : '✕'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Download */}
      <div className="bg-[var(--cl-bg)] border border-[var(--cl-border)] rounded-xl p-5 space-y-3">
        <p className="text-xs text-[var(--cl-text-3)] font-medium uppercase tracking-wider">Download a model</p>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={pullName}
            disabled={!!pulling || !ollama.online}
            onChange={(e) => setPullName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') startPull(pullName); }}
            placeholder="Model name, e.g. llama3.2:3b"
            className="flex-1 bg-[var(--cl-surface)] border border-[var(--cl-border-2)] rounded-lg px-3 py-2 text-sm text-[var(--cl-text)] font-mono placeholder-[var(--cl-text-3)] focus:outline-none focus:border-[var(--cl-accent)]/50 transition-colors disabled:opacity-50"
          />
          {pulling ? (
            <button
              onClick={() => abortRef.current && abortRef.current.abort()}
              className="px-4 py-2 text-sm rounded-lg border border-[var(--cl-border-2)] text-[var(--cl-text-2)] hover:bg-[var(--cl-hover)] transition-all flex-shrink-0"
            >
              Cancel
            </button>
          ) : (
            <button
              onClick={() => startPull(pullName)}
              disabled={!pullName.trim() || !ollama.online}
              className="px-4 py-2 text-sm bg-[var(--cl-accent)] hover:bg-[var(--cl-accent-h)] text-white rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
            >
              Download
            </button>
          )}
        </div>

        {pulling && progress && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-[var(--cl-text-3)]">
              <span className="truncate">{pulling}: {progress.status}</span>
              <span>{progress.pct !== null ? `${progress.pct}%` : ''}</span>
            </div>
            <div className="h-1.5 rounded-full bg-[var(--cl-border)] overflow-hidden">
              <div
                className={`h-full bg-[var(--cl-accent)] transition-all duration-300 ${progress.pct === null ? 'animate-pulse' : ''}`}
                style={{ width: `${progress.pct === null ? 100 : progress.pct}%` }}
              />
            </div>
          </div>
        )}

        {!pulling && (
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTED.filter((s) => !ollama.models.some((m) => m.name === s || m.name === `${s}:latest`)).map((s) => (
              <button
                key={s}
                disabled={!ollama.online}
                onClick={() => setPullName(s)}
                className="px-2.5 py-1 text-xs font-mono rounded-lg border border-[var(--cl-border-2)] text-[var(--cl-text-3)] hover:text-[var(--cl-text)] hover:bg-[var(--cl-hover)] transition-all disabled:opacity-40"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      <p className="text-xs text-[var(--cl-text-3)] leading-relaxed">
        Tips: bigger models are smarter but slower and need more memory. Tools (web search, commands, to-do list) only work with models that support tool calling, such as
        Qwen3 or Llama 3.1+; other models still chat normally. Ollama's default memory window is small, so for projects set <span className="font-mono">OLLAMA_CONTEXT_LENGTH=8192</span> before starting it.
      </p>
    </div>
  );
}
