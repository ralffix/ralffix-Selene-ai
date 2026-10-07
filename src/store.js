// ── Unified store abstraction ──
// Uses localStorage for synchronous access (fast initial loads, browser dev mode)
// AND the Tauri Store plugin for proper desktop persistence (app data dir)
// Best of both worlds: fast startup + durable storage

const isTauri = () => typeof window !== 'undefined' && window.__TAURI_INTERNALS__;

// In-memory cache for synchronous reads (used by storeGet)
const cache = new Map();

// Cached Tauri Store instance (loaded once by initStore, reused by storeSet/storeRemove)
let tauriStoreInstance = null;

// All known luna- prefixed keys
const LUNA_KEYS = [
  'luna-chats',
  'luna-messages',
  'luna-apikeys',
  'luna-activekey',
  'luna-sidebar',
  'luna-custom-prompt',
  'luna-theme',
  'luna-projects',
  'luna-prompt-system-enabled',
  'luna-prompt-upgrader-enabled',
  'luna-searxng-url',
  'luna-boosts',
  'luna-memory',
  'luna-todos',
  'luna-prompts',
  'luna-custom-models',
  'luna-llama-settings',
];

// ── Populate cache from localStorage synchronously at module load time ──
// This runs before any React component renders, so useState(() => storeGet(...))
// initialisers will have the correct data on the very first render.
(function initCacheSync() {
  try {
    for (const key of LUNA_KEYS) {
      const raw = localStorage.getItem(key);
      if (raw !== null) {
        try { cache.set(key, JSON.parse(raw)); } catch { cache.set(key, raw); }
      }
    }
  } catch { /* localStorage unavailable */ }
})();

/**
 * Initialise the store — overlays with Tauri Store data (authoritative).
 * Call once on app mount via useEffect. The cache is already populated
 * from localStorage at module load time, so initial renders are correct.
 */
export async function initStore() {
  // If already initialised, skip
  if (tauriStoreInstance !== null) return tauriStoreInstance;

  // 2. In Tauri, overlay with data from the store plugin (authoritative)
  if (isTauri()) {
    try {
      const { Store } = await import('@tauri-apps/plugin-store');
      const store = await Store.load('luna-store.json');
      for (const key of LUNA_KEYS) {
        const val = await store.get(key);
        if (val !== null && val !== undefined) {
          cache.set(key, val);
        }
      }
      tauriStoreInstance = store;
      return store;
    } catch (err) {
      console.warn('Tauri store unavailable, falling back to localStorage:', err);
    }
  }
  return null;
}

/**
 * Synchronously read a value from the in-memory cache.
 * Fast — safe to use in useState(() => storeGet(...)) initialisers.
 * Returns `fallback` when the key is not found.
 */
export function storeGet(key, fallback = null) {
  return cache.has(key) ? cache.get(key) : fallback;
}

/**
 * Persist a value to both localStorage (sync) and the Tauri Store (async).
 * After calling, the value is immediately available via storeGet().
 */
export async function storeSet(key, value) {
  cache.set(key, value);

  // Always write to localStorage (sync, fast future loads + browser dev mode)
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* quota exceeded or unavailable — non-fatal */ }

  // Also write to the Tauri Store (async, proper desktop persistence)
  if (isTauri() && tauriStoreInstance) {
    try {
      await tauriStoreInstance.set(key, value);
    } catch { /* store unavailable — non-fatal */ }
  }
}

/**
 * Remove a key from all stores (cache, localStorage, Tauri Store).
 */
export async function storeRemove(key) {
  cache.delete(key);

  try { localStorage.removeItem(key); } catch {}

  if (isTauri() && tauriStoreInstance) {
    try {
      await tauriStoreInstance.delete(key);
    } catch {}
  }
}

/**
 * Check whether we're in a Tauri environment.
 */
export function isTauriEnv() {
  return isTauri();
}
