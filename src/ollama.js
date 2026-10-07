// Talking to a local Ollama server (https://ollama.com): list, download and delete models.

export const OLLAMA_DEFAULT_URL = 'http://localhost:11434';

// The server address is the Ollama connection's "key" when it looks like a URL, otherwise localhost
export function ollamaBaseUrl(apiKeys) {
  const k = (apiKeys || []).find((x) => x.provider === 'ollama' && /^https?:\/\//i.test(x.key || ''));
  if (!k) return OLLAMA_DEFAULT_URL;
  return k.key.trim().replace(/\/+$/, '').replace(/\/(v1|api)(\/.*)?$/, '');
}

// Installed models, e.g. [{ name: 'llama3.2:latest', size: 2019393189 }]. Throws if Ollama is not reachable.
export async function listOllamaModels(base, signal) {
  const resp = await fetch(`${base}/api/tags`, { signal });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data = await resp.json();
  return (data.models || [])
    .map((m) => ({ name: m.name || m.model, size: m.size || 0 }))
    .filter((m) => m.name)
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Downloads a model. onProgress({ status, total, completed }) is called while it downloads.
export async function pullOllamaModel(base, name, onProgress, signal) {
  const resp = await fetch(`${base}/api/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: name, name, stream: true }),
    signal,
  });
  if (!resp.ok || !resp.body) {
    let msg = `HTTP ${resp.status}`;
    try { const j = JSON.parse(await resp.text()); msg = (typeof j.error === 'string' ? j.error : j.error?.message) || msg; } catch { /* keep status */ }
    throw new Error(msg);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim()) continue;
      let j;
      try { j = JSON.parse(line); } catch { continue; }
      if (j.error) throw new Error(typeof j.error === 'string' ? j.error : j.error.message || 'Download failed');
      if (onProgress) onProgress({ status: j.status || '', total: j.total, completed: j.completed });
    }
  }
}

export async function deleteOllamaModel(base, name) {
  const resp = await fetch(`${base}/api/delete`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: name, name }),
  });
  if (!resp.ok) {
    let msg = `HTTP ${resp.status}`;
    try { const j = JSON.parse(await resp.text()); msg = (typeof j.error === 'string' ? j.error : j.error?.message) || msg; } catch { /* keep status */ }
    throw new Error(msg);
  }
}

export function formatSize(bytes) {
  if (!bytes) return '';
  const gb = bytes / 1e9;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  return `${Math.round(bytes / 1e6)} MB`;
}
