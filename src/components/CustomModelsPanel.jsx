import { useState, useEffect } from 'react';

const CTX_OPTIONS = [4096, 8192, 16384, 32768];

function Seg({ options, value, onChange }) {
  return (
    <div className="inline-flex rounded-lg border border-[var(--cl-border-2)] overflow-hidden">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`px-2.5 py-1 text-xs transition-colors ${
            value === o.value
              ? 'bg-[var(--cl-accent)]/15 text-[var(--cl-accent)]'
              : 'text-[var(--cl-text-3)] hover:text-[var(--cl-text)] hover:bg-[var(--cl-hover)]'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function CustomModelsPanel({ local, activeProvider, activeModel, onUseModel }) {
  const { models, settings, run } = local;
  const [binaryStatus, setBinaryStatus] = useState(null); // { found, path } | null
  const [checking, setChecking] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!confirmRemove) return undefined;
    const t = setTimeout(() => setConfirmRemove(null), 4000);
    return () => clearTimeout(t);
  }, [confirmRemove]);

  // Check once when the tab opens
  useEffect(() => {
    let alive = true;
    local.checkBinary().then((r) => { if (alive) setBinaryStatus(r); });
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const recheck = async () => {
    setChecking(true);
    setBinaryStatus(await local.checkBinary());
    setChecking(false);
  };

  const installEngine = async (backend) => {
    setError('');
    const err = await local.installEngine(backend);
    await recheck();
    if (err && err !== 'The llama.cpp installation was cancelled.') setError(err);
  };

  const pickFolder = async () => {
    setError('');
    try {
      if (!window.__TAURI_INTERNALS__) throw new Error('Picking a folder only works in the desktop app.');
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({ multiple: false, directory: true });
      const path = Array.isArray(selected) ? selected[0] : selected;
      if (path) local.setSettings({ modelsDir: path });
    } catch (e) {
      setError(String((e && e.message) || e));
    }
  };

  const addFile = async () => {
    setError('');
    try {
      if (!window.__TAURI_INTERNALS__) throw new Error('Picking a file only works in the desktop app.');
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({ multiple: false, directory: false, filters: [{ name: 'GGUF model', extensions: ['gguf'] }] });
      const path = Array.isArray(selected) ? selected[0] : selected;
      if (path) {
        const entry = local.addModel(path);
        // First model: use it right away
        if (models.length === 0 && entry) setTimeout(() => onUseModel(entry.name), 200);
      }
    } catch (e) {
      setError(String((e && e.message) || e));
    }
  };

  const removeModel = (m) => {
    if (confirmRemove !== m.id) { setConfirmRemove(m.id); return; }
    setConfirmRemove(null);
    local.removeModel(m.id);
  };

  const loadNow = async (m) => {
    setError('');
    try {
      const err = await local.ensureLoaded(m.name);
      if (err) setError(err);
    } catch (e) {
      if (!e || e.name !== 'AbortError') setError(String((e && e.message) || e));
    }
  };

  const statusColor = run.status === 'ready' ? 'bg-green-400' : run.status === 'loading' ? 'bg-yellow-400 animate-pulse' : run.status === 'error' ? 'bg-red-400' : 'bg-[var(--cl-text-3)]';

  return (
    <div className="p-6 space-y-6">
      <div>
        <h3 className="text-lg font-medium text-[var(--cl-text)]">Local models</h3>
        <p className="text-sm text-[var(--cl-text-3)] mt-1">
          Pick a model file (.gguf) and Selene runs it by itself on your computer with llama.cpp. Free, private and works offline.
          Selene starts the model the first time you chat with it.
        </p>
      </div>

      {/* Engine */}
      <div className="bg-[var(--cl-bg)] border border-[var(--cl-border)] rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${binaryStatus ? (binaryStatus.found ? 'bg-green-400' : 'bg-red-400') : 'bg-[var(--cl-text-3)]'}`} />
            <div className="min-w-0">
              <p className="text-sm font-medium text-[var(--cl-text)]">
                {binaryStatus ? (binaryStatus.found ? 'llama-server is installed' : 'llama-server not found') : 'Checking llama-server…'}
              </p>
              {binaryStatus && binaryStatus.found && <p className="text-xs text-[var(--cl-text-3)] font-mono truncate">{binaryStatus.path}</p>}
            </div>
          </div>
          <button
            onClick={recheck}
            disabled={checking}
            className="px-3 py-1.5 text-xs text-[var(--cl-text-3)] hover:text-[var(--cl-text)] rounded-lg hover:bg-[var(--cl-hover)] transition-all disabled:opacity-50 flex-shrink-0"
          >
            {checking ? 'Checking…' : 'Check again'}
          </button>
        </div>

        <div>
          <label className="block text-xs text-[var(--cl-text-3)] mb-1.5">Path to llama-server (leave as is if it is installed normally)</label>
          <input
            type="text"
            value={settings.binary}
            onChange={(e) => local.setSettings({ binary: e.target.value })}
            placeholder="llama-server"
            className="w-full bg-[var(--cl-surface)] border border-[var(--cl-border-2)] rounded-lg px-3 py-2 text-sm text-[var(--cl-text)] font-mono placeholder-[var(--cl-text-3)] focus:outline-none focus:border-[var(--cl-accent)]/50 transition-colors"
          />
        </div>

        <div>
          <label className="block text-xs text-[var(--cl-text-3)] mb-1.5">Folder for models you install from Find &amp; install</label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={settings.modelsDir || ''}
              onChange={(e) => local.setSettings({ modelsDir: e.target.value })}
              placeholder="Default: ~/Documents/SeleneModels"
              className="flex-1 bg-[var(--cl-surface)] border border-[var(--cl-border-2)] rounded-lg px-3 py-2 text-sm text-[var(--cl-text)] font-mono placeholder-[var(--cl-text-3)] focus:outline-none focus:border-[var(--cl-accent)]/50 transition-colors"
            />
            <button
              onClick={pickFolder}
              className="px-3 py-2 text-xs rounded-lg border border-[var(--cl-border-2)] text-[var(--cl-text-2)] hover:bg-[var(--cl-hover)] transition-all flex-shrink-0"
            >
              Browse
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs text-[var(--cl-text-3)]">Free the GPU memory when the model is idle for</span>
          <Seg
            value={settings.idleMinutes ?? 15}
            onChange={(v) => local.setSettings({ idleMinutes: v })}
            options={[{ value: 5, label: '5 min' }, { value: 15, label: '15 min' }, { value: 60, label: '1 hour' }, { value: 0, label: 'Never' }]}
          />
        </div>

        {local.engine && local.engine.status === 'installing' ? (
          <div className="space-y-1.5 border-t border-[var(--cl-border)] pt-3">
            <div className="flex items-center justify-between text-xs text-[var(--cl-text-3)]">
              <span className="truncate">{local.engine.text}{local.engine.pct !== null && local.engine.pct !== undefined ? ` ${local.engine.pct}%` : ''}</span>
              <button onClick={local.cancelEngineInstall} className="ml-3 flex-shrink-0 hover:text-[var(--cl-text)] transition-colors">Cancel</button>
            </div>
            <div className="h-1.5 rounded-full bg-[var(--cl-border)] overflow-hidden">
              <div
                className={`h-full bg-[var(--cl-accent)] transition-all duration-500 ${local.engine.pct === null || local.engine.pct === undefined ? 'animate-pulse' : ''}`}
                style={{ width: `${local.engine.pct === null || local.engine.pct === undefined ? 100 : local.engine.pct}%` }}
              />
            </div>
          </div>
        ) : (
          binaryStatus && !binaryStatus.found && (
            <div className="border-t border-[var(--cl-border)] pt-3 space-y-2.5">
              <p className="text-xs text-[var(--cl-text-3)] leading-relaxed">
                Selene can download and set up llama.cpp for you (about 30 to 60 MB, no admin password needed). It also does this by itself the first time you chat with a local model.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => installEngine('vulkan')}
                  className="px-3.5 py-1.5 text-xs font-medium rounded-lg bg-[var(--cl-accent)] hover:bg-[var(--cl-accent-h)] text-white transition-all"
                >
                  Install automatically (GPU)
                </button>
                <button
                  onClick={() => installEngine('cpu')}
                  className="px-3.5 py-1.5 text-xs rounded-lg border border-[var(--cl-border-2)] text-[var(--cl-text-2)] hover:bg-[var(--cl-hover)] transition-all"
                >
                  CPU only
                </button>
              </div>
            </div>
          )
        )}

        {binaryStatus && !binaryStatus.found && (
          <p className="text-xs text-[var(--cl-text-3)] leading-relaxed border-t border-[var(--cl-border)] pt-3">
            Or install it yourself with your package manager. On Arch / EndeavourOS the ArchWiki says to install <span className="font-mono">llama-cpp</span> plus a GPU
            backend: <span className="font-mono">ggml-vulkan</span> (any GPU) or <span className="font-mono">ggml-cuda</span> (NVIDIA). Example:{' '}
            <span className="font-mono">sudo pacman -S llama-cpp ggml-vulkan</span>. If the package names differ, check the ArchWiki page "Llama.cpp".
            If you built it yourself, put the full path above (use /home/..., not ~).
          </p>
        )}
      </div>

      {error && (
        <div className="text-xs text-red-400 bg-red-400/10 border border-red-400/30 rounded-lg px-3 py-2 break-words whitespace-pre-wrap">{error}</div>
      )}

      {/* Running status */}
      <div className="bg-[var(--cl-bg)] border border-[var(--cl-border)] rounded-xl p-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${statusColor}`} />
          <div className="min-w-0">
            <p className="text-sm text-[var(--cl-text)] truncate">
              {run.status === 'ready' && `Running: ${run.modelName}`}
              {run.status === 'loading' && `Loading ${run.modelName}…`}
              {run.status === 'error' && 'The model could not start'}
              {run.status === 'stopped' && 'No model running'}
            </p>
            {run.status === 'stopped' && !run.error && (
              <p className="text-xs text-[var(--cl-text-3)]">It starts automatically when you send a message.</p>
            )}
            {run.error && <p className="text-xs text-red-400 whitespace-pre-wrap break-words">{run.error}</p>}
          </div>
        </div>
        {(run.status === 'ready' || run.status === 'loading') && (
          <button
            onClick={() => local.stop()}
            className="px-3 py-1.5 text-xs rounded-lg border border-[var(--cl-border-2)] text-[var(--cl-text-2)] hover:bg-[var(--cl-hover)] transition-all flex-shrink-0"
          >
            Stop
          </button>
        )}
      </div>

      {/* Models */}
      <div className="bg-[var(--cl-bg)] border border-[var(--cl-border)] rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs text-[var(--cl-text-3)] font-medium uppercase tracking-wider">Your models</p>
          <button
            onClick={addFile}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[var(--cl-accent)] hover:bg-[var(--cl-accent-h)] text-white transition-all"
          >
            + Add model file
          </button>
        </div>

        {models.length === 0 ? (
          <p className="text-xs text-[var(--cl-text-3)] text-center py-5 leading-relaxed">
            No models yet. Open "Find &amp; install" above to get one, or add a .gguf file you already have.
          </p>
        ) : (
          <div className="space-y-2">
            {models.map((m) => {
              const inUse = activeProvider === 'custom' && activeModel === m.name;
              const isRunning = run.modelName === m.name && run.status === 'ready';
              const isLoading = run.modelName === m.name && run.status === 'loading';
              return (
                <div key={m.id} className="rounded-lg border border-[var(--cl-border)] px-3 py-2.5 space-y-2.5">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[var(--cl-text)] font-mono truncate">{m.name}</p>
                      <p className="text-xs text-[var(--cl-text-3)] truncate" title={m.path}>{m.path}</p>
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
                    {!isRunning && !isLoading && (
                      <button
                        onClick={() => loadNow(m)}
                        title="Start it now so the first reply is fast"
                        className="px-3 py-1 text-xs rounded-lg text-[var(--cl-text-3)] hover:text-[var(--cl-text)] hover:bg-[var(--cl-hover)] transition-all"
                      >
                        Load now
                      </button>
                    )}
                    <button
                      onClick={() => removeModel(m)}
                      title="Remove from the list (the file is not deleted)"
                      className={`px-2 py-1 text-xs rounded-lg transition-all ${
                        confirmRemove === m.id
                          ? 'bg-red-500/15 text-red-400'
                          : 'text-[var(--cl-text-3)] hover:text-red-400 hover:bg-red-400/10'
                      }`}
                    >
                      {confirmRemove === m.id ? 'Click again to remove' : '✕'}
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[var(--cl-text-3)]">Memory window</span>
                      <Seg
                        value={m.ctx}
                        onChange={(v) => local.updateModel(m.id, { ctx: v })}
                        options={CTX_OPTIONS.map((c) => ({ value: c, label: `${c / 1024}k` }))}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[var(--cl-text-3)]">Run on</span>
                      <Seg
                        value={m.ngl === 0 ? 0 : 99}
                        onChange={(v) => local.updateModel(m.id, { ngl: v })}
                        options={[{ value: 99, label: 'GPU' }, { value: 0, label: 'CPU only' }]}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <p className="text-xs text-[var(--cl-text-3)] leading-relaxed">
        Tips: the model has to fit in your GPU memory (or RAM on CPU only). A bigger memory window lets Selene remember more of the chat and project but uses more memory,
        and changing it restarts the model. With a small window, set History size to Small in AI Boosts. Tools (web search, commands, to-do list) only work with models
        that support tool calling; other models still chat normally.
      </p>
    </div>
  );
}
