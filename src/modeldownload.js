// Find .gguf models on Hugging Face and download them (resumable) with curl.
// Everything goes through the shell plugin, so no extra Rust code is needed.

const HF = 'https://huggingface.co';

const isTauri = () => typeof window !== 'undefined' && window.__TAURI_INTERNALS__;
export const shq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

export async function sh(cmd) {
  const { Command } = await import('@tauri-apps/plugin-shell');
  return Command.create('run-script', ['-c', cmd]).execute(); // { code, stdout, stderr }
}

// One request through curl (no browser headers). Returns { status, body }.
async function curlJson(url) {
  const out = await sh(`curl -sL --max-time 25 -w '\\n%{http_code}' ${shq(url)}`);
  if (out.code !== 0) throw new Error('Could not reach Hugging Face. Check your internet connection.');
  const text = out.stdout || '';
  const cut = text.lastIndexOf('\n');
  return { status: parseInt(text.slice(cut + 1), 10) || 0, body: text.slice(0, Math.max(cut, 0)) };
}

function describeHfError(status, body) {
  let detail = '';
  try {
    const j = JSON.parse(body);
    detail = typeof j.error === 'string' ? j.error : (j.error && j.error.message) || '';
  } catch {
    detail = String(body || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
  }
  return `Hugging Face answered HTTP ${status || 'unknown'}${detail ? `: ${detail}` : ''}.${status >= 500 ? ' Their server may be having trouble, try again in a minute.' : ''}`;
}

// JSON from Hugging Face. Normal fetch first. If the webview is blocked or the server errors,
// ask curl instead (up to 3 tries), and show the server's own message if it still fails.
export async function getJson(url, signal) {
  let status = 0;
  let body = '';
  try {
    const r = await fetch(url, { signal });
    status = r.status;
    if (r.ok) return await r.json();
    body = await r.text().catch(() => '');
  } catch (e) {
    if (!(e instanceof TypeError)) throw e; // aborted, or unreadable answer
    status = 0; // blocked or no connection
  }

  if (status === 404) throw new Error('Not found on Hugging Face.');

  if (isTauri() && (status === 0 || status >= 500)) {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (signal && signal.aborted) throw new DOMException('Aborted', 'AbortError');
      const res = await curlJson(url);
      if (res.status >= 200 && res.status < 300) {
        try { return JSON.parse(res.body); } catch { throw new Error('Hugging Face sent an answer Selene could not read.'); }
      }
      status = res.status;
      body = res.body;
      if (res.status !== 0 && res.status < 500) break;
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
  }
  throw new Error(describeHfError(status, body));
}

// Models that have GGUF files. sort: 'downloads' | 'likes' | 'lastModified'
export async function searchModels(query, sort = 'downloads', signal) {
  const params = new URLSearchParams({ filter: 'gguf', sort, direction: '-1', limit: '24' });
  params.append('filter', 'text-generation'); // only normal text/chat models
  if (query && query.trim()) params.set('search', query.trim());
  const data = await getJson(`${HF}/api/models?${params.toString()}`, signal);
  return (Array.isArray(data) ? data : [])
    .map((m) => ({ id: m.id || m.modelId, downloads: m.downloads || 0, likes: m.likes || 0 }))
    .filter((m) => m.id);
}

export function quantOf(name) {
  const m = String(name).match(/(?:^|[-_.])((?:IQ|Q)\d(?:_[A-Z0-9]+)*|BF16|F16|F32|MXFP4)(?=$|[-_.])/i);
  return m ? m[1].toUpperCase() : '';
}

// The .gguf files of one repo. Files split in parts (-00001-of-00003) become one entry.
export async function listGgufFiles(repoId, signal) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repoId)) throw new Error('That does not look like a Hugging Face model name.');
  const data = await getJson(`${HF}/api/models/${repoId}/tree/main?recursive=true`, signal);
  const files = (Array.isArray(data) ? data : [])
    .filter((f) => f.type === 'file' && /\.gguf$/i.test(f.path) && !/mmproj/i.test(f.path)) // mmproj = vision add-on, not a model
    .map((f) => ({ path: f.path, size: (f.lfs && f.lfs.size) || f.size || 0 }));

  const groups = new Map();
  for (const f of files) {
    const base = f.path.split('/').pop();
    const m = base.match(/^(.*)-(\d{5})-of-(\d{5})\.gguf$/i);
    const folder = f.path.slice(0, f.path.length - base.length);
    const id = m ? `${folder}${m[1]}` : f.path;
    const name = m ? m[1] : base.replace(/\.gguf$/i, '');
    if (!groups.has(id)) groups.set(id, { id, name, quant: quantOf(name), parts: [], expected: m ? Number(m[3]) : 1 });
    groups.get(id).parts.push({ ...f, index: m ? Number(m[2]) : 1 });
  }

  return [...groups.values()]
    .map((g) => {
      g.parts.sort((a, b) => a.index - b.index);
      g.size = g.parts.reduce((n, p) => n + p.size, 0);
      return g;
    })
    .filter((g) => g.parts.length === g.expected && g.size > 0)
    .sort((a, b) => a.size - b.size);
}

function hfUrl(repoId, path) {
  return `${HF}/${repoId}/resolve/main/${path.split('/').map(encodeURIComponent).join('/')}?download=true`;
}

export async function defaultModelsDir() {
  const out = await sh('echo "$HOME/Documents/SeleneModels"');
  return (out.stdout || '').trim() || '/tmp/SeleneModels';
}

export async function fileSize(path) {
  const out = await sh(`stat -c %s ${shq(path)} 2>/dev/null || echo 0`);
  const n = parseInt((out.stdout || '').trim(), 10);
  return Number.isFinite(n) ? n : 0;
}

async function freeBytes(dir) {
  const out = await sh(`df -Pk ${shq(dir)} | tail -1 | awk '{print $4}'`);
  const kb = parseInt((out.stdout || '').trim(), 10);
  return Number.isFinite(kb) ? kb * 1024 : null;
}

function curlProblem(code, stderr) {
  if (code === 22) return 'The server refused the download. The model may need a Hugging Face login, which Selene does not support yet.';
  if (code === 6 || code === 7 || code === 28) return 'Could not connect to Hugging Face. Check your internet connection and try again to resume.';
  if (code === 23) return 'Could not write the file. Is the disk full?';
  const tail = String(stderr || '').trim().split('\n').slice(-2).join(' ');
  return `The download stopped (curl code ${code}).${tail ? ` ${tail}` : ''} Try again to resume.`;
}

// Runs curl for one file. Resumes if a .part file is already there. Returns { code, stderr }.
export async function runCurl({ url, tmp, ctrl, onBytes }) {
  const { Command } = await import('@tauri-apps/plugin-shell');
  let stderr = '';
  let timer = null;
  const cmd = Command.create('run-script', ['-c', `exec curl -L --fail --retry 3 --retry-delay 2 -C - -sS -o ${shq(tmp)} ${shq(url)}`]);
  cmd.stderr.on('data', (d) => { stderr += String(d); });

  const finished = new Promise((resolve) => {
    cmd.on('close', (d) => resolve(d && typeof d.code === 'number' ? d.code : -1));
    cmd.on('error', (e) => { stderr += String(e); resolve(-1); });
  });

  try {
    ctrl.child = await cmd.spawn();
  } catch (e) {
    return { code: -1, stderr: String(e) };
  }
  // The file grows while it downloads, so its size is the progress
  timer = setInterval(async () => { onBytes(await fileSize(tmp)); }, 800);
  const code = await finished;
  clearInterval(timer);
  ctrl.child = null;
  return { code, stderr };
}

// Downloads every part of a group into <dir>/<owner>__<repo>/ and returns the path of the first file.
// ctrl = { cancelled: false, child: null }; set ctrl.cancelled and kill ctrl.child to stop.
export async function downloadGroup({ repoId, group, dir, ctrl, onProgress }) {
  if (!isTauri()) throw new Error('Downloading models only works in the desktop app.');
  const folder = `${dir.replace(/\/+$/, '')}/${repoId.replace('/', '__')}`;

  const mk = await sh(`mkdir -p ${shq(folder)}`);
  if (mk.code !== 0) throw new Error(`Could not create the folder ${folder}`);
  const hasCurl = await sh('command -v curl');
  if (hasCurl.code !== 0) throw new Error('curl is needed to download models. Install it first (sudo pacman -S curl).');

  const total = group.size;

  // Is there room? Only count what is still missing.
  let onDisk = 0;
  for (const part of group.parts) {
    const dest = `${folder}/${part.path.split('/').pop()}`;
    onDisk += Math.min(part.size, Math.max(await fileSize(dest), await fileSize(`${dest}.part`)));
  }
  const free = await freeBytes(folder);
  const need = total - onDisk;
  if (free !== null && need + 200e6 > free) {
    const gb = (n) => (n / 1e9).toFixed(1);
    throw new Error(`Not enough disk space: this needs ${gb(need)} GB more and only ${gb(free)} GB is free in ${folder}.`);
  }

  let doneBytes = 0;
  onProgress(0, total);
  for (const part of group.parts) {
    if (ctrl.cancelled) throw new Error('cancelled');
    const base = part.path.split('/').pop();
    const dest = `${folder}/${base}`;
    const tmp = `${dest}.part`;

    if ((await fileSize(dest)) === part.size) { // this part is already finished
      doneBytes += part.size;
      onProgress(doneBytes, total);
      continue;
    }

    if ((await fileSize(tmp)) !== part.size) {
      const { code, stderr } = await runCurl({
        url: hfUrl(repoId, part.path),
        tmp,
        ctrl,
        onBytes: (n) => onProgress(doneBytes + Math.min(n, part.size), total),
      });
      if (ctrl.cancelled) throw new Error('cancelled');
      if (code !== 0) throw new Error(curlProblem(code, stderr));
    }

    if ((await fileSize(tmp)) !== part.size) throw new Error('The download is incomplete. Try again to resume.');
    const mv = await sh(`mv -f ${shq(tmp)} ${shq(dest)}`);
    if (mv.code !== 0) throw new Error('Could not save the finished file.');
    doneBytes += part.size;
    onProgress(doneBytes, total);
  }

  return `${folder}/${group.parts[0].path.split('/').pop()}`;
}
