// Run your own .gguf model files with llama.cpp's `llama-server`, started and stopped by Selene.
// llama-server speaks the same OpenAI-style API as the other providers, so chat, streaming and tools just work.

import { useState, useRef, useEffect, useCallback } from 'react';
import { storeGet, storeSet } from './store';
import { downloadGroup, defaultModelsDir } from './modeldownload';
import { installLlamaCpp } from './llamainstall';

export const LLAMA_FIRST_PORT = 8089;
const MODELS_KEY = 'luna-custom-models';
const SETTINGS_KEY = 'luna-llama-settings';

const isTauri = () => typeof window !== 'undefined' && window.__TAURI_INTERNALS__;
const shq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`; // safe single-quoting for the shell
const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

function abortError() {
  return new DOMException('Aborted', 'AbortError');
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) { reject(abortError()); return; }
    const timer = setTimeout(resolve, ms);
    if (signal) signal.addEventListener('abort', () => { clearTimeout(timer); reject(abortError()); }, { once: true });
  });
}

// First port (from 8089 up) where nothing answers yet
async function findFreePort() {
  for (let p = LLAMA_FIRST_PORT; p < LLAMA_FIRST_PORT + 8; p++) {
    try {
      await fetch(`http://127.0.0.1:${p}/health`, { signal: AbortSignal.timeout(500) });
      // something answered here, try the next port
    } catch {
      return p;
    }
  }
  return LLAMA_FIRST_PORT + 8;
}

// llama-server answers /health with 503 while the model loads and 200 when it is ready
async function waitReady(base, signal, state, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (signal && signal.aborted) throw abortError();
    if (state.exited) return false;
    try {
      const r = await fetch(`${base}/health`, { signal: AbortSignal.timeout(2000) });
      if (r.ok) return true;
    } catch { /* not up yet */ }
    await sleep(700, signal);
  }
  return false;
}

async function spawnLlama({ binary, model, port, state, onLog, onExit }) {
  const { Command } = await import('@tauri-apps/plugin-shell');
  const ngl = Number.isFinite(Number(model.ngl)) ? Number(model.ngl) : 99;
  const bin = binary || 'llama-server';
  const slash = bin.lastIndexOf('/');
  // A downloaded build keeps its libraries next to the program
  const libs = slash > 0 ? `export LD_LIBRARY_PATH=${shq(bin.slice(0, slash))}:"$LD_LIBRARY_PATH"; ` : '';
  const line = `${libs}exec ${shq(bin)} -m ${shq(model.path)} -c ${Number(model.ctx) || 16384} -ngl ${ngl} --host 127.0.0.1 --port ${port} --jinja`;
  const cmd = Command.create('run-script', ['-c', line]);
  cmd.stdout.on('data', (d) => onLog(String(d)));
  cmd.stderr.on('data', (d) => onLog(String(d)));
  cmd.on('close', (d) => { state.exited = true; state.code = d ? d.code : null; onExit(state.code); });
  cmd.on('error', (e) => { state.exited = true; onLog(String(e)); onExit(null); });
  return cmd.spawn();
}

export function useLocalModels() {
  const [models, setModels] = useState(() => {
    const saved = storeGet(MODELS_KEY, []);
    return Array.isArray(saved) ? saved : [];
  });
  const [settings, setSettingsState] = useState(() => ({ binary: 'llama-server', ...(storeGet(SETTINGS_KEY, {}) || {}) }));
  const [run, setRun] = useState({ status: 'stopped', modelName: null, port: null, error: '' });

  const modelsRef = useRef(models);
  modelsRef.current = models;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const runRef = useRef(run);
  const childRef = useRef(null);
  const stateRef = useRef({ exited: true, code: null });
  const logRef = useRef('');
  const lastUsedRef = useRef(Date.now()); // when a chat last used the model (for the idle unload)

  useEffect(() => { storeSet(MODELS_KEY, models); }, [models]);
  useEffect(() => { storeSet(SETTINGS_KEY, settings); }, [settings]);

  const update = useCallback((patch) => {
    runRef.current = { ...runRef.current, ...patch };
    setRun(runRef.current);
  }, []);

  const setSettings = useCallback((patch) => setSettingsState((prev) => ({ ...prev, ...patch })), []);

  const getBaseUrl = useCallback(() => `http://127.0.0.1:${runRef.current.port || LLAMA_FIRST_PORT}`, []);

  const stop = useCallback(async () => {
    const child = childRef.current;
    childRef.current = null;
    stateRef.current = { exited: true, code: null };
    if (child) { try { await child.kill(); } catch { /* already gone */ } }
    update({ status: 'stopped', modelName: null, port: null });
  }, [update]);

  // Make sure `name` is loaded and ready. Returns null when ready, or an error text.
  const ensureLoaded = useCallback(async (name, signal, onNotice, retried = false) => {
    const model = modelsRef.current.find((m) => m.name === name);
    if (!model) return 'This local model is no longer in your list. Add it again in Settings, Local models.';
    if (!isTauri()) return 'Running local models only works in the desktop app.';
    lastUsedRef.current = Date.now();

    const cur = runRef.current;
    if (cur.status === 'ready' && cur.modelName === name && childRef.current && !stateRef.current.exited) return null;

    // First time: no llama-server yet, so Selene downloads and sets it up by itself
    const bin = await checkBinary();
    if (!bin.found) {
      if (onNotice) onNotice('Setting up llama.cpp (first time only)…');
      const installError = await installEngine('vulkan', onNotice);
      if (installError) return installError;
    }

    await stop();
    const port = await findFreePort();
    const base = `http://127.0.0.1:${port}`;
    const state = { exited: false, code: null };
    stateRef.current = state;
    logRef.current = '';
    update({ status: 'loading', modelName: name, port, error: '' });
    if (onNotice) onNotice(`Loading ${name}…`);

    const onLog = (t) => { logRef.current = (logRef.current + t).slice(-4000); };
    const onExit = (code) => {
      // The server stopped by itself (crash, out of memory...) while it was supposed to be ready
      if (stateRef.current === state && runRef.current.status === 'ready') {
        update({ status: 'stopped', modelName: null, port: null, error: `The model stopped unexpectedly (code ${code}).` });
      }
    };

    try {
      childRef.current = await spawnLlama({ binary: settingsRef.current.binary, model, port, state, onLog, onExit });
    } catch (e) {
      const msg = `Could not start llama-server: ${String((e && e.message) || e)}`;
      update({ status: 'error', error: msg });
      return msg;
    }

    let ok = false;
    try {
      ok = await waitReady(base, signal, state, 300000);
    } catch (e) {
      await stop();
      throw e; // stopped by the user: let the caller treat it as an abort
    }

    if (!ok && !retried && settingsRef.current.engineBackend === 'vulkan' && /libvulkan|error while loading shared libraries/i.test(logRef.current)) {
      // The GPU build cannot start on this computer (no Vulkan): switch to the CPU build and try again
      await stop();
      if (onNotice) onNotice('The GPU version could not start. Switching to the CPU version…');
      const cpuError = await installEngine('cpu', onNotice);
      if (cpuError) return cpuError;
      return ensureLoaded(name, signal, onNotice, true);
    }

    if (!ok) {
      const tail = logRef.current.trim().split('\n').slice(-6).join('\n');
      const notFound = state.exited && (state.code === 127 || /not found|no such file/i.test(logRef.current));
      const arch = logRef.current.match(/unknown model architecture: '([^']+)'/);
      const msg = arch
        ? `This file cannot run in llama.cpp: it uses the "${arch[1]}" model type, which llama.cpp does not know. It is probably not a normal chat model. Remove it from your list and install a regular text model instead (for example Qwen3, Llama, Gemma or Mistral, the Q4_K_M file).`
        : notFound
        ? 'llama-server was not found. Install llama.cpp, or set the path to llama-server in Settings, Local models.'
        : `The model did not start${state.exited ? ' (llama-server stopped)' : ' in time'}.${tail ? `\n${tail}` : ''}`;
      await stop();
      update({ status: 'error', error: msg });
      return msg;
    }

    update({ status: 'ready', error: '' });
    return null;
  }, [stop, update]);

  // Adds a .gguf file to the list
  const addModel = useCallback((path) => {
    const existing = modelsRef.current.find((m) => m.path === path);
    if (existing) return existing;
    const file = String(path || '').split(/[\\/]/).pop().replace(/\.gguf$/i, '').replace(/-\d{5}-of-\d{5}$/i, '') || 'Local model';
    let name = file;
    let n = 2;
    while (modelsRef.current.some((m) => m.name === name)) name = `${file} (${n++})`;
    const entry = { id: genId(), name, path, ctx: 16384, ngl: 99 };
    setModels((prev) => [...prev, entry]);
    return entry;
  }, []);

  const updateModel = useCallback((id, patch) => {
    setModels((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
    // New settings only apply the next time the model loads
    const m = modelsRef.current.find((x) => x.id === id);
    if (m && runRef.current.modelName === m.name) stop();
  }, [stop]);

  const removeModel = useCallback((id) => {
    const m = modelsRef.current.find((x) => x.id === id);
    if (m && runRef.current.modelName === m.name) stop();
    setModels((prev) => prev.filter((x) => x.id !== id));
  }, [stop]);

  // Is llama-server installed? Returns { found, path }
  const checkBinary = useCallback(async () => {
    if (!isTauri()) return { found: false, path: '' };
    try {
      const { Command } = await import('@tauri-apps/plugin-shell');
      const out = await Command.create('run-script', ['-c', `command -v ${shq(settingsRef.current.binary || 'llama-server')}`]).execute();
      const p = (out.stdout || '').trim();
      return { found: out.code === 0 && !!p, path: p };
    } catch {
      return { found: false, path: '' };
    }
  }, []);

  // Best effort: stop the model when the window closes
  useEffect(() => {
    const onUnload = () => { if (childRef.current) { try { childRef.current.kill(); } catch { /* ignore */ } } };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, []);

  // Frees the GPU/RAM when the model has not been used for a while (it starts again by itself on the next message)
  useEffect(() => {
    const timer = setInterval(() => {
      const minutes = Number(settingsRef.current.idleMinutes ?? 15);
      if (!minutes || runRef.current.status !== 'ready') return;
      if (Date.now() - lastUsedRef.current > minutes * 60000) stop();
    }, 30000);
    return () => clearInterval(timer);
  }, [stop]);

  // ── Installing llama.cpp by itself (the program that runs the models) ──
  const [engine, setEngine] = useState({ status: 'idle', pct: null, text: '', error: '' });
  const engineCtrlRef = useRef(null);

  // Returns null when done, or an error text. onNotice (optional) gets progress lines for the chat.
  const installEngine = useCallback(async (backend = 'vulkan', onNotice) => {
    if (engineCtrlRef.current) return 'llama.cpp is already being installed.';
    const ctrl = { cancelled: false, child: null };
    engineCtrlRef.current = ctrl;
    setEngine({ status: 'installing', pct: null, text: 'Starting…', error: '' });
    let lastNote = '';
    try {
      const res = await installLlamaCpp({
        backend,
        ctrl,
        onProgress: (p) => {
          setEngine({ status: 'installing', pct: p.pct, text: p.text, error: '' });
          const note = p.pct !== null && p.pct !== undefined ? `${p.text} ${p.pct}%` : p.text;
          if (onNotice && note !== lastNote) { lastNote = note; onNotice(note); }
        },
      });
      settingsRef.current = { ...settingsRef.current, binary: res.path, engineBackend: backend, engineTag: res.tag };
      setSettingsState((prev) => ({ ...prev, binary: res.path, engineBackend: backend, engineTag: res.tag }));
      setEngine({ status: 'done', pct: 100, text: `llama.cpp ${res.tag} is ready`, error: '' });
      return null;
    } catch (e) {
      const cancelled = ctrl.cancelled;
      const msg = cancelled ? 'The llama.cpp installation was cancelled.' : String((e && e.message) || e);
      setEngine({ status: cancelled ? 'idle' : 'error', pct: null, text: '', error: cancelled ? '' : msg });
      return msg;
    } finally {
      engineCtrlRef.current = null;
    }
  }, []);

  const cancelEngineInstall = useCallback(() => {
    const ctrl = engineCtrlRef.current;
    if (!ctrl) return;
    ctrl.cancelled = true;
    if (ctrl.child) { try { ctrl.child.kill(); } catch { /* already gone */ } }
  }, []);

  // ── Downloads from the model browser (they keep going when Settings is closed) ──
  const [downloads, setDownloads] = useState({}); // key -> { repoId, name, done, total, status, error }
  const ctrlsRef = useRef({});

  const startDownload = useCallback(async (repoId, group) => {
    const key = `${repoId}::${group.id}`;
    if (ctrlsRef.current[key]) return;
    const ctrl = { cancelled: false, child: null };
    ctrlsRef.current[key] = ctrl;
    const set = (patch) => setDownloads((prev) => ({
      ...prev,
      [key]: { repoId, name: group.name, total: group.size, done: 0, ...(prev[key] || {}), ...patch },
    }));
    set({ status: 'downloading', done: 0, error: '' });
    try {
      const dir = (settingsRef.current.modelsDir || '').trim() || await defaultModelsDir();
      const path = await downloadGroup({ repoId, group, dir, ctrl, onProgress: (done, total) => set({ done, total }) });
      addModel(path);
      set({ status: 'done', done: group.size });
    } catch (e) {
      if (ctrl.cancelled) {
        setDownloads((prev) => { const { [key]: _, ...rest } = prev; return rest; });
      } else {
        set({ status: 'error', error: String((e && e.message) || e) });
      }
    } finally {
      delete ctrlsRef.current[key];
    }
  }, [addModel]);

  const cancelDownload = useCallback((key) => {
    const ctrl = ctrlsRef.current[key];
    if (!ctrl) return;
    ctrl.cancelled = true;
    if (ctrl.child) { try { ctrl.child.kill(); } catch { /* already gone */ } }
  }, []);

  return { models, settings, setSettings, run, getBaseUrl, ensureLoaded, stop, addModel, updateModel, removeModel, checkBinary, downloads, startDownload, cancelDownload, engine, installEngine, cancelEngineInstall };
}
