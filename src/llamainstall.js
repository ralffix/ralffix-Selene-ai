// Downloads and sets up llama.cpp (the program that runs .gguf models) without needing admin rights.
// Uses the official prebuilt Linux builds from GitHub: a Vulkan (GPU) build and a CPU build.

import { sh, shq, getJson, fileSize, runCurl } from './modeldownload';

const isTauri = () => typeof window !== 'undefined' && window.__TAURI_INTERNALS__;

export async function defaultEngineDir() {
  const out = await sh('echo "$HOME/.local/share/luna/llama.cpp"');
  return (out.stdout || '').trim() || '/tmp/luna-llama.cpp';
}

// Newest release that has the build we want
function pickAsset(releases, backend) {
  const wanted = backend === 'cpu' ? /bin-ubuntu-x64\.(tar\.gz|zip)$/i : /bin-ubuntu-vulkan-x64\.(tar\.gz|zip)$/i;
  for (const rel of Array.isArray(releases) ? releases : []) {
    if (rel.draft) continue;
    const asset = (rel.assets || []).find((a) => wanted.test(a.name));
    if (asset) return { tag: rel.tag_name, name: asset.name, url: asset.browser_download_url, size: asset.size || 0 };
  }
  return null;
}

async function findServer(dir) {
  const out = await sh(`find ${shq(dir)} -name llama-server -type f 2>/dev/null | head -n 1`);
  return (out.stdout || '').trim();
}

// backend: 'vulkan' (GPU) or 'cpu'. ctrl = { cancelled, child }. onProgress({ pct, text }).
// Returns { path, tag } of the llama-server program.
export async function installLlamaCpp({ backend = 'vulkan', ctrl, onProgress }) {
  if (!isTauri()) throw new Error('Installing llama.cpp only works in the desktop app.');

  const arch = ((await sh('uname -m')).stdout || '').trim();
  if (arch !== 'x86_64') {
    throw new Error(`The automatic install only supports 64-bit Intel/AMD computers (x86_64), and this one is ${arch || 'unknown'}. Install llama.cpp yourself and set its path.`);
  }
  const hasCurl = await sh('command -v curl');
  if (hasCurl.code !== 0) throw new Error('curl is needed to download llama.cpp. Install it first (sudo pacman -S curl).');

  onProgress({ pct: null, text: 'Looking for the latest llama.cpp…' });
  const releases = await getJson('https://api.github.com/repos/ggml-org/llama.cpp/releases?per_page=8');
  const asset = pickAsset(releases, backend);
  if (!asset) {
    throw new Error(`Could not find a ${backend === 'cpu' ? 'CPU' : 'Vulkan'} Linux download in the latest llama.cpp releases. Install llama.cpp yourself and set its path.`);
  }

  const base = await defaultEngineDir();
  const dest = `${base}/${asset.tag}-${backend}`;
  const archive = `${base}/${asset.name}`;
  const part = `${archive}.part`;
  if ((await sh(`mkdir -p ${shq(base)}`)).code !== 0) throw new Error(`Could not create the folder ${base}`);

  // Already installed from an earlier try?
  let bin = await findServer(dest);

  if (!bin) {
    onProgress({ pct: 0, text: `Downloading llama.cpp ${asset.tag}…` });
    if (!asset.size || (await fileSize(part)) !== asset.size) {
      const { code, stderr } = await runCurl({
        url: asset.url,
        tmp: part,
        ctrl,
        onBytes: (n) => onProgress({
          pct: asset.size ? Math.min(99, Math.round((n / asset.size) * 100)) : null,
          text: `Downloading llama.cpp ${asset.tag}…`,
        }),
      });
      if (ctrl.cancelled) throw new Error('cancelled');
      if (code !== 0) throw new Error(`The llama.cpp download failed (curl code ${code}). ${String(stderr || '').trim().slice(0, 200)}`);
    }
    if ((await sh(`mv -f ${shq(part)} ${shq(archive)}`)).code !== 0) throw new Error('Could not save the llama.cpp download.');

    onProgress({ pct: null, text: 'Unpacking llama.cpp…' });
    await sh(`mkdir -p ${shq(dest)}`);
    const unpack = /\.zip$/i.test(asset.name)
      ? `unzip -oq ${shq(archive)} -d ${shq(dest)}`
      : `tar -xzf ${shq(archive)} -C ${shq(dest)}`;
    const ex = await sh(unpack);
    if (ex.code !== 0) throw new Error(`Could not unpack llama.cpp. ${String(ex.stderr || '').trim().slice(0, 200)}`);
    await sh(`rm -f ${shq(archive)}`);

    bin = await findServer(dest);
    if (!bin) throw new Error('llama.cpp was downloaded, but llama-server was not inside it.');
  }
  await sh(`chmod +x ${shq(bin)}`);

  // Make sure it can actually start on this computer
  onProgress({ pct: null, text: 'Checking llama.cpp…' });
  const dir = bin.slice(0, bin.lastIndexOf('/'));
  const test = await sh(`export LD_LIBRARY_PATH=${shq(dir)}:"$LD_LIBRARY_PATH"; ${shq(bin)} --version 2>&1`);
  const text = `${test.stdout || ''}${test.stderr || ''}`;
  if (test.code !== 0 && /error while loading shared libraries|cannot open shared object/i.test(text)) {
    const lib = (text.match(/lib[\w.+-]+\.so[\w.]*/) || ['a system library'])[0];
    const hint = /vulkan/i.test(lib) ? ' Install the Vulkan loader (sudo pacman -S vulkan-icd-loader) or use the CPU version.' : '';
    throw new Error(`llama.cpp needs ${lib}, which is missing on this computer.${hint}`);
  }

  return { path: bin, tag: asset.tag };
}
