// ── SearXNG auto-setup utilities ──
// Uses `docker run` directly (works on Mac, Windows, Linux without Docker Compose)

export const DEFAULT_SEARXNG_URL = 'http://127.0.0.1:8080';
const CONTAINER_NAME = 'luna-searxng';

function generateSettingsYml(secretKey) {
  return `use_default_settings: true

general:
  instance_name: "Selene Search"

server:
  secret_key: "${secretKey}"
  bind_address: "0.0.0.0"
  port: 8080
  limiter: false
  image_proxy: false
  cors:
    allowed_origins: ["*"]

search:
  formats:
    - html
    - json
  safe_search: 0
  autocomplete: ""
`;
}

function generateSecretKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const bytes = new Uint8Array(33);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 33; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  for (let i = 0; i < 33; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

async function isTauri() {
  return typeof window !== 'undefined' && window.__TAURI_INTERNALS__;
}

/**
 * Run a shell command via Tauri with a timeout.
 * Tries `run-bash` (bash login shell = real PATH) first, falls back to `run-script` (sh -c).
 */
async function runShellCommand(command, timeoutMs = 10000) {
  if (!(await isTauri())) {
    return { code: -1, stdout: '', stderr: 'Not in Tauri mode' };
  }

  const runWith = async (cmdName, args) => {
    const { Command } = await import('@tauri-apps/plugin-shell');
    const cmd = Command.create(cmdName, args);
    return await Promise.race([
      cmd.execute(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs)
      ),
    ]);
  };

  // Try bash login shell first — loads .bashrc/.profile = your real PATH
  try {
    const result = await runWith('run-bash', ['-l', '-c', command]);
    if (result.code === 0) return result;
  } catch { /* bash unavailable or cmd failed — fall through to sh */ }

  // Fall back to sh -c
  try {
    return await runWith('run-script', ['-c', command]);
  } catch (err) {
    return { code: -1, stdout: '', stderr: String(err) };
  }
}

/**
 * Detect the Docker binary path for the current platform.
 * Returns ['docker'] as the primary candidate, which relies on PATH.
 * On Linux, also checks common paths.
 */
function getDockerCandidates() {
  const candidates = [];

  // Platform-specific common paths
  if (navigator.platform?.toLowerCase().includes('win')) {
    candidates.push(
      'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe',
      'C:\\Program Files\\Docker Toolbox\\docker.exe',
      'docker'
    );
  } else if (navigator.platform?.toLowerCase().includes('mac')) {
    candidates.push(
      '/usr/local/bin/docker',
      '/opt/homebrew/bin/docker',
      'docker'
    );
  } else {
    // Linux
    candidates.push(
      '/usr/bin/docker',
      '/usr/local/bin/docker',
      '/snap/bin/docker',
      'docker'
    );
  }

  return candidates;
}

export async function checkSearxngRunning(url = DEFAULT_SEARXNG_URL) {
  const resolved = await resolveSearxngUrl(url);
  return !!resolved;
}

/**
 * Try both the given URL and its localhost/127.0.0.1 counterpart, since
 * WebKitGTK (Linux Tauri webview) sometimes fails hard on IPv6 `localhost`
 * resolution even when the regular system browser silently falls back to
 * IPv4. Returns the first URL that actually answers, or null if neither does.
 */
export function getSearxngCandidates(url) {
  const candidates = [url];
  if (url.includes('localhost')) candidates.push(url.replace('localhost', '127.0.0.1'));
  else if (url.includes('127.0.0.1')) candidates.push(url.replace('127.0.0.1', 'localhost'));
  return [...new Set(candidates)];
}

export async function resolveSearxngUrl(url = DEFAULT_SEARXNG_URL) {
  for (const candidate of getSearxngCandidates(url)) {
    try {
      const base = candidate.replace(/\/$/, '');
      const response = await fetch(`${base}/search?q=test&format=json`, {
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) return candidate;
    } catch { /* try next candidate */ }
  }
  return null;
}

/**
 * Start SearXNG using `docker run` directly.
 * Cross-platform: works on Mac, Windows, and Linux without Docker Compose.
 */
export async function startSearxng(configDir) {
  if (!(await isTauri())) {
    return { success: false, message: '⚠ Auto-setup requires the Tauri desktop app.' };
  }

  try {
    // Step 1: Create config directory
    const mkdirCmd = navigator.platform?.toLowerCase().includes('win')
      ? `mkdir "${configDir}" "${configDir}\\data" 2>nul`
      : `mkdir -p "${configDir}" "${configDir}/data"`;

    const mkdir = await runShellCommand(mkdirCmd, 5000);
    if (mkdir.code !== 0) {
      return { success: false, message: `⚠ Failed to create directory: ${mkdir.stderr || mkdir.stdout}` };
    }

    // Step 2: Write config files
    const secretKey = generateSecretKey();
    const settingsYml = generateSettingsYml(secretKey);

    const writeSettings = await runShellCommand(
      `cat > "${configDir}/settings.yml" << 'SEARXNG_EOF'\n${settingsYml}SEARXNG_EOF`,
      5000
    );
    if (writeSettings.code !== 0) {
      return { success: false, message: `⚠ Failed to write settings: ${writeSettings.stderr || writeSettings.stdout}` };
    }

    // Step 3: Try to run SearXNG with each Docker candidate
    const dockerCandidates = getDockerCandidates();

    // Container-side paths are always Linux-style (Docker containers are Linux-based,
    // even on Docker Desktop for Windows/Mac). Only the host path uses platform separators.
    // The Tauri shell plugin uses sh/bash (via Git Bash/WSL on Windows), so Unix-style
    // host paths work across all platforms in practice.
    const volumes = `-v "${configDir}/settings.yml:/etc/searxng/settings.yml:ro" -v "${configDir}/data:/etc/searxng/data"`;

    for (const dockerBin of dockerCandidates) {
      // Skip checking existence on Windows and PATH-based docker
      if (dockerBin.includes('/')) {
        const check = await runShellCommand(`test -x "${dockerBin}" && echo "yes"`, 3000);
        if (check.code !== 0 || check.stdout.trim() !== 'yes') continue;
      }

      // Remove old container if it exists
      await runShellCommand(`"${dockerBin}" rm -f ${CONTAINER_NAME} 2>/dev/null`, 5000);

      const runCmd = `"${dockerBin}" run -d --name ${CONTAINER_NAME} -p 8080:8080 ${volumes} -e SEARXNG_BASE_URL=http://localhost:8080/ --restart unless-stopped searxng/searxng:latest`;

      const result = await runShellCommand(runCmd, 120000); // 2 min for image pull

      if (result.code === 0) {
        return { success: true, message: '✅ SearXNG is starting on http://localhost:8080\nIt may take a moment to be ready.' };
      }

      // Container already exists but is running
      if (result.stderr?.includes('is already running') || result.stdout?.includes('is already running')) {
        return { success: true, message: '✅ SearXNG is already running on http://localhost:8080' };
      }

      // If we got a meaningful error (not "command not found"), report it
      const err = (result.stderr || result.stdout || '').toLowerCase();
      if (err && !err.includes('not found') && !err.includes('no such file') && !err.includes('command not found')) {
        return { success: false, message: `⚠ ${dockerBin} failed:\n${result.stderr || result.stdout}` };
      }
    }

    // Step 4: None worked — show helpful instructions
    return {
      success: false,
      message: '⚠ Could not start SearXNG.\n\n' +
        'Docker is installed but we had trouble running the container.\n\n' +
        '**Try this in your terminal:**\n' +
        '```bash\n' +
        'docker rm -f luna-searxng 2>/dev/null\n' +
        'docker run -d \\\n' +
        '  --name luna-searxng \\\n' +
        '  -p 8080:8080 \\\n' +
        `  -v "${configDir}/settings.yml:/etc/searxng/settings.yml:ro" \\\n` +
        `  -v "${configDir}/data:/etc/searxng/data" \\\n` +
        '  -e SEARXNG_BASE_URL=http://localhost:8080/ \\\n' +
        '  --restart unless-stopped \\\n' +
        '  searxng/searxng:latest\n' +
        '```\n\n' +
        'Then set the URL to http://localhost:8080 in Settings.',
    };
  } catch (err) {
    return { success: false, message: `⚠ Setup failed: ${String(err)}` };
  }
}

export async function waitForSearxng(url = DEFAULT_SEARXNG_URL, maxRetries = 10) {
  for (let i = 0; i < maxRetries; i++) {
    const running = await checkSearxngRunning(url);
    if (running) return true;
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}
