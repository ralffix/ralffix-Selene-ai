import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import ChatArea from './components/ChatArea';
import InputBox from './components/InputBox';
import ApiModal from './components/ApiModal';
import SettingsModal from './components/SettingsModal';
import PromptUpgradeModal from './components/PromptUpgradeModal';
import { initStore, storeGet, storeSet } from './store';
import { PROVIDER_DISPLAY, PROVIDER_DEFAULT_MODEL, getEndpoint } from './types';
import { OLLAMA_DEFAULT_URL, ollamaBaseUrl, listOllamaModels } from './ollama';
import { useLocalModels } from './localmodels';
import { TOOL_DEFINITIONS, executeTool, needsApproval } from './tools';
import { DEFAULT_SEARXNG_URL, checkSearxngRunning, startSearxng, waitForSearxng } from './setup-searxng.js';
import { stripThinking } from './thinking';
import { runAgents } from './agents';
import AgentPanel from './components/AgentPanel';
import TodoPanel from './components/TodoPanel';
import { mergePrompts, fillPrompt, PROMPT_DEFAULTS } from './prompts';

// ── File system helpers (Tauri only — safe fallback in browser) ──
const isTauri = () => typeof window !== 'undefined' && window.__TAURI_INTERNALS__;

async function readProjectTree(folderPath) {
  if (!folderPath || !isTauri()) return null;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke('get_project_tree', { path: folderPath, maxDepth: 3 });
  } catch { return null; }
}

async function writeFile(path, content) {
  if (!isTauri()) return '⚠ Browser mode — file write not available';
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('write_project_file', { path, content });
    return null;
  } catch (err) {
    return `⚠ Failed to write ${path}: ${String(err)}`;
  }
}

async function readFile(path) {
  if (!isTauri()) return { error: '⚠ Browser mode — file read not available' };
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const content = await invoke('read_project_file', { path });
    return { content };
  } catch (err) {
    return { error: `⚠ Could not read: ${String(err)}` };
  }
}

// ── Parse Selene's response for file reads ──
function parseFileReads(rawContent) {
  const content = stripThinking(rawContent); // ignore anything inside Selene's reasoning
  const reads = [];
  const readRegex = /\[read:([^\]]+)\]/g;
  let match;
  while ((match = readRegex.exec(content)) !== null) {
    const filePath = match[1].trim();
    if (filePath && !filePath.includes(' ')) {
      reads.push({ path: filePath, original: match[0] });
    }
  }
  return reads;
}

// ── Parse Selene's response for file writes ──
function parseFileWrites(rawContent) {
  const content = stripThinking(rawContent); // code mentioned while thinking must never be written to disk
  const writes = [];
  const blockRegex = /```([^\n`]+\.[a-zA-Z0-9]+(?:\/[^\n`]*)?)\n([\s\S]*?)```/g;
  let match;
  while ((match = blockRegex.exec(content)) !== null) {
    const filePath = match[1].trim();
    const fileContent = match[2];
    if (filePath.includes('.') && !filePath.includes(' ')) {
      writes.push({ path: filePath, content: fileContent });
    }
  }
  return writes;
}

// ── Export chat as markdown ──
function exportChatAsMarkdown(chat, messages) {
  if (!chat || !messages || messages.length === 0) return;
  let md = `# ${chat.title}\n\n`;
  md += `_Exported on ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}_\n\n---\n\n`;
  for (const msg of messages) {
    const role = msg.role === 'assistant' ? '**Selene**' : '**You**';
    md += `### ${role}\n\n${msg.role === 'assistant' ? stripThinking(msg.content) : msg.content}\n\n`;
  }
  const blob = new Blob([md], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${chat.title.replace(/[^a-zA-Z0-9]/g, '_')}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function loadFromStorage(key, fallback) {
  return storeGet(key, fallback);
}

const LS_KEYS = {
  chats: 'luna-chats',
  messages: 'luna-messages',
  apiKeys: 'luna-apikeys',
  activeKeyId: 'luna-activekey',
  sidebarCollapsed: 'luna-sidebar',
  customPrompt: 'luna-custom-prompt',
  projects: 'luna-projects',
  searxngUrl: 'luna-searxng-url',
  promptSystemEnabled: 'luna-prompt-system-enabled',
  promptUpgraderEnabled: 'luna-prompt-upgrader-enabled',
  boosts: 'luna-boosts',
  memory: 'luna-memory',
  todos: 'luna-todos',
  prompts: 'luna-prompts',
};

// ── AI Boosts (all configurable in Settings → AI Boosts) ──
const DEFAULT_BOOSTS = {
  tokenSaver: true,        // trim history to save tokens
  historyBudget: 24000,    // max characters of history sent per request
  fileReadLimit: 12000,    // max characters loaded from a file read (0 = no limit)
  maxTokens: 4096,         // max length of each reply
  temperature: 0.7,        // creativity
  responseStyle: 'default',
  autoRetry: true,         // wait and retry on short rate limits
  toolWebSearch: true,
  toolReadUrl: true,
  toolRunCommand: true,
  commandApproval: 'ask',  // 'ask' = approve every command | 'safe' = read-only commands in the project folder run on their own | 'always' = never ask
  toolTodos: true,         // Selene may keep a to-do list in the side panel
  toolOutputLimit: 6000,   // hard cap on a single tool result, in characters (0 = no limit)
  thinking: 'off',         // 'off' | 'light' | 'normal' | 'deep'
  agentsEnabled: false,    // Selene may start helper agents
  maxAgents: 3,            // the most agents she may start at once
  agentTokens: 1024,       // max length of each agent's report
  upgraderStyle: 'balanced', // Prompt Upgrader: 'light' | 'balanced' | 'detailed'
  upgraderContext: true,   // Prompt Upgrader sees the project folder and the last two messages
  upgraderSkipShort: true, // Prompt Upgrader skips short messages like "yes" or "continue"
  upgraderAuto: false,     // Prompt Upgrader sends the upgraded prompt without asking
};

// Which prompt (see prompts.js) goes with each response style
const STYLE_PROMPT_KEYS = { concise: 'styleConcise', detailed: 'styleDetailed', steps: 'styleSteps' };

// ── Thinking: Selene reasons inside <think> tags first; the UI shows it in a collapsible block ──
const THINKING_PROMPT_KEYS = { light: 'thinkLight', normal: 'thinkNormal', deep: 'thinkDeep' };
const THINKING_EXTRA_TOKENS = { light: 1024, normal: 2048, deep: 4096 }; // thinking uses part of the reply budget
const THINKING_EFFORT = { light: 'low', normal: 'medium', deep: 'high' };

// Models that already think on their own (they need no extra prompt)
function isReasoningModel(model) {
  return /(qwen3|qwq|deepseek-r1|r1-distill|gpt-oss|\bo1\b|\bo3\b|\bo4\b)/i.test(model || '');
}

function getThinkingPrompt(level, model, P) {
  const key = THINKING_PROMPT_KEYS[level];
  if (!key || isReasoningModel(model)) return '';
  return fillPrompt(P.thinkWrapper, { instruction: P[key] });
}

// ── Helper agents: Selene can split a big job between several agents that work in parallel ──
const AGENT_LIMIT = 8;
function clampAgents(n) {
  return Math.max(2, Math.min(AGENT_LIMIT, Number(n) || 3));
}

function getAgentsPrompt(boosts, P) {
  if (!boosts.agentsEnabled) return '';
  return fillPrompt(P.agents, { max: clampAgents(boosts.maxAgents) });
}

// ── Memory (what Selene knows about the user) ──
const DEFAULT_MEMORY = { enabled: true, autoSave: true, items: [] };
const MEMORY_MAX_ITEMS = 100;
const MEMORY_MAX_FACT_CHARS = 300;
const MEMORY_PROMPT_CHARS = 2500; // how much memory text is sent with each request

// Text block that goes into the system prompt. If the budget runs out, the newest facts win.
function buildMemoryBlock(memory) {
  if (!memory || !memory.enabled || !memory.items || memory.items.length === 0) return '';
  const lines = [];
  let used = 0;
  for (let i = memory.items.length - 1; i >= 0; i--) {
    const line = `- ${memory.items[i].text}`;
    if (used + line.length > MEMORY_PROMPT_CHARS) break;
    lines.push(line);
    used += line.length + 1;
  }
  return lines.reverse().join('\n');
}

// Refuse to store anything that looks like a password or key
function looksLikeSecret(text) {
  return /(api[\s_-]?key|password|passwd|secret|private[\s_-]?key|bearer)\b/i.test(text)
    || /\b(sk|gsk|pk|ghp|xox[bap])[-_][A-Za-z0-9_-]{10,}/.test(text)
    || /\b[A-Za-z0-9_-]{32,}\b/.test(text);
}

// Only send the tools the user has switched on (each tool definition costs tokens on every request)
function getEnabledTools(boosts, memory) {
  const memoryOn = !!(memory && memory.enabled && memory.autoSave);
  const agentsOn = !!boosts.agentsEnabled;
  const enabled = TOOL_DEFINITIONS.filter((t) => {
    const n = t.function.name;
    if (n === 'web_search') return boosts.toolWebSearch;
    if (n === 'read_url') return boosts.toolReadUrl;
    if (n === 'run_command') return boosts.toolRunCommand;
    if (n === 'save_memory' || n === 'forget_memory') return memoryOn;
    if (n === 'delegate_to_agents') return agentsOn;
    if (n === 'update_todos') return boosts.toolTodos;
    return true;
  });
  return enabled.length > 0 ? enabled : undefined;
}

// Providers say things like "Please try again in 7.38s" or "in 2m3.5s". Returns ms to wait, or null.
function parseRetryWaitMs(err) {
  const msg = err?.message || '';
  if (!/429|rate limit|too many requests/i.test(msg)) return null;
  const m = msg.match(/try again in ((?:\d+h)?(?:\d+m(?!s))?(?:[\d.]+s)?(?:[\d.]+ms)?)/i);
  if (!m || !m[1]) return null;
  const t = m[1];
  const h = t.match(/(\d+)h/);
  const mi = t.match(/(\d+)m(?!s)/);
  const s = t.match(/([\d.]+)s/);
  const msPart = t.match(/([\d.]+)ms/);
  const ms = (h ? Number(h[1]) * 3600000 : 0) + (mi ? Number(mi[1]) * 60000 : 0)
    + (s ? Number(s[1]) * 1000 : 0) + (msPart ? Number(msPart[1]) : 0) + 500;
  if (ms <= 500 || ms > 30000) return null; // long waits (e.g. daily limits) are not worth waiting for
  return ms;
}

// ── Key rotation helpers ──
function getProviderKeys(apiKeys, provider) {
  return apiKeys.filter((k) => k.provider === provider);
}

function getNextKeyId(apiKeys, provider, currentKeyId) {
  const providerKeys = getProviderKeys(apiKeys, provider);
  if (providerKeys.length <= 1) return null;
  const currentIdx = providerKeys.findIndex((k) => k.id === currentKeyId);
  if (currentIdx === -1) return providerKeys[0]?.id ?? null;
  const nextIdx = (currentIdx + 1) % providerKeys.length;
  return providerKeys[nextIdx]?.id ?? null;
}

function isRetryableError(err) {
  const msg = (err?.message || '').toLowerCase();
  return (
    msg.includes('429') || msg.includes('401') || msg.includes('403') ||
    msg.includes('rate limit') || msg.includes('quota') ||
    msg.includes('insufficient_quota') || msg.includes('insufficient balance') ||
    msg.includes('exceeded') || msg.includes('too many requests') ||
    msg.includes('tokens per day')
  );
}

// ── Context compaction: keeps token usage (and rate-limit hits) down ──
const MAX_HISTORY_CHARS = 24000;   // roughly 6k tokens of history per request
const OLD_TOOL_RESULT_CHARS = 400; // tool outputs from earlier turns get shortened to this

function msgSize(m) {
  return (m.content ? m.content.length : 0) + (m.tool_calls ? JSON.stringify(m.tool_calls).length : 0);
}

function compactHistory(messages, budget = MAX_HISTORY_CHARS) {
  let lastUserIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') { lastUserIdx = i; break; }
  }

  // 1. Shorten tool results from earlier turns (the model already used them)
  const out = messages.map((m, i) => {
    if (m.role === 'tool' && i < lastUserIdx && m.content && m.content.length > OLD_TOOL_RESULT_CHARS) {
      return { ...m, content: m.content.slice(0, OLD_TOOL_RESULT_CHARS) + '\n...[older tool output trimmed]' };
    }
    return m;
  });

  // 2. Drop the oldest messages until we are under budget
  let total = out.reduce((n, m) => n + msgSize(m), 0);
  let start = 0;
  while (total > budget && start < out.length - 1) {
    total -= msgSize(out[start]);
    start++;
  }

  // 3. Never start in the middle of a tool exchange; always begin at a user message
  if (lastUserIdx >= 0) {
    if (start > lastUserIdx) start = lastUserIdx;
    while (start < lastUserIdx && out[start].role !== 'user') start++;
  }
  return out.slice(start);
}

// Hard cap on one tool result, so a single huge output (e.g. `ls -R` on a build folder) can't blow the context
function capToolOutput(text, limit) {
  const s = typeof text === 'string' ? text : String(text ?? '');
  if (!limit || s.length <= limit) return s;
  return s.slice(0, limit) + `\n...[output truncated: showing ${limit} of ${s.length} characters. Use a narrower command, e.g. grep, head, or one specific folder.]`;
}

// ── Prompt Upgrader ──
function buildUpgraderPrompt(style, refine, P) {
  const styleKey = { light: 'upgraderLight', balanced: 'upgraderBalanced', detailed: 'upgraderDetailed' }[style] || 'upgraderBalanced';
  let extra = '';
  if (refine) {
    extra = P.upgraderRefine;
    if (refine === 'shorter') extra += P.upgraderShorter;
    if (refine === 'detailed') extra += P.upgraderMoreDetailed;
  }
  return fillPrompt(P.upgraderBase, { style: P[styleKey], refine: extra });
}

// Very short replies ("yes", "continue", "thanks") are not worth an upgrade
function isTooShortToUpgrade(text) {
  return text.length < 30 || /^(yes|no|ok|okay|continue|go on|go|thanks|thank you|thx|sure|do it|stop|y|n)[\s.!?]*$/i.test(text);
}

// Only changes the Ollama state when something really changed (avoids re-rendering the whole app every check)
function nextOllamaState(prev, online, models) {
  const list = models || prev.models;
  const same = prev.checked && prev.online === online && prev.models.length === list.length
    && prev.models.every((m, i) => m.name === list[i].name && m.size === list[i].size);
  return same ? prev : { online, models: list, checked: true };
}

// ── Command approval: which commands may run without asking ("Auto for read-only") ──
const SAFE_COMMANDS = new Set(['ls', 'cat', 'head', 'tail', 'grep', 'rg', 'wc', 'pwd', 'cd', 'tree', 'file', 'stat', 'du', 'which', 'echo', 'basename', 'dirname', 'realpath', 'find']);
const SAFE_GIT = new Set(['status', 'log', 'diff', 'show', 'branch', 'ls-files', 'rev-parse', 'remote']);
const SENSITIVE_PATHS = /(\.ssh|\.gnupg|\.aws|\.kube|\.netrc|\.env\b|id_rsa|id_ed25519|shadow|passwd|credentials|secret|token)/i;

// True only for plain look-but-don't-touch commands that stay inside the project folder
function isSafeReadCommand(command, folder) {
  const cmd = String(command || '').trim();
  if (!cmd || !folder) return false;
  if (/[`<>\n\r]|\$\(|\$\{|\.\.|~/.test(cmd)) return false; // no redirects, substitutions, parent folders or home
  if (SENSITIVE_PATHS.test(cmd)) return false;

  // Any absolute path must be inside the project folder
  const base = folder.replace(/\/+$/, '');
  const withoutFolder = cmd.split(base).join('FOLDER');
  const paths = withoutFolder.match(/(?:^|[\s"'=:])\/[^\s"'|;&]*/g) || [];
  for (const p of paths) {
    if (p.replace(/^[\s"'=:]/, '') !== '/dev/null') return false;
  }

  for (const part of cmd.split(/&&|\|\||;|\|/)) {
    const words = part.trim().split(/\s+/);
    const first = words[0];
    if (!first) return false;
    if (first === 'git') {
      if (!SAFE_GIT.has(words[1])) return false;
    } else if (first === 'sed') {
      if (words[1] !== '-n' || !/^["']?[0-9]+(,[0-9$]+)?p["']?$/.test(words[2] || '')) return false;
    } else if (!SAFE_COMMANDS.has(first)) {
      return false;
    }
    if (first === 'find' && /-(exec|execdir|ok|okdir|delete|fprint|fprintf|fls)\b/.test(part)) return false;
  }
  return true;
}

// ── Build system prompt (memoized by folder path, prepends custom prompt) ──
const systemPromptCache = new Map();

async function buildSystemPrompt(chatLinkedFolder, customPrompt, style, memoryBlock, memoryAutoSave, thinkingPrompt, agentsPrompt, P) {
  const cacheKey = `${chatLinkedFolder || '__no_folder__'}::${customPrompt || ''}::${style || ''}::${memoryBlock || ''}::${memoryAutoSave ? 1 : 0}::${thinkingPrompt || ''}::${agentsPrompt || ''}`;

  if (systemPromptCache.has(cacheKey)) {
    return systemPromptCache.get(cacheKey);
  }

  let prompt = '';
  if (customPrompt && customPrompt.trim()) {
    prompt += customPrompt.trim() + '\n\n---\n';
  }

  // The texts come from prompts.js (the user can edit them in Settings, Prompts)
  prompt += [P.base, P.rules, P.codeFormat].filter(Boolean).join('\n\n');

  const styleKey = STYLE_PROMPT_KEYS[style];
  if (styleKey && P[styleKey]) {
    prompt += '\n\n' + P[styleKey];
  }

  if (memoryBlock && P.memoryUse) {
    prompt += '\n\n' + fillPrompt(P.memoryUse, { memory: memoryBlock });
  }
  if (memoryAutoSave && P.memorySave) {
    prompt += '\n\n' + P.memorySave;
  }
  if (thinkingPrompt) {
    prompt += '\n\n' + thinkingPrompt;
  }
  if (agentsPrompt) {
    prompt += '\n\n' + agentsPrompt;
  }

  if (chatLinkedFolder) {
    const rawTree = await readProjectTree(chatLinkedFolder);
    const tree = rawTree && rawTree.length > 4000 ? rawTree.slice(0, 4000) + '\n...[folder listing shortened]' : rawTree;
    if (P.folder) prompt += '\n\n' + fillPrompt(P.folder, { folder: chatLinkedFolder });
    if (!tree && P.folderNoTree) {
      prompt += '\n\n' + fillPrompt(P.folderNoTree, { folder: chatLinkedFolder });
    }
    if (tree && P.folderTree) {
      prompt += '\n\n' + fillPrompt(P.folderTree, { folder: chatLinkedFolder, tree });
    }
  }

  if (chatLinkedFolder) return prompt; // folder contents change, so these prompts are never cached
  systemPromptCache.set(cacheKey, prompt);
  if (systemPromptCache.size > 5) {
    const firstKey = systemPromptCache.keys().next().value;
    systemPromptCache.delete(firstKey);
  }

  return prompt;
}

export default function App() {
  const abortRef = useRef(null);
  const initialised = useRef(false);
  const chatsRef = useRef(null);

  // ── Streaming buffer (RAF-batched) ──
  const streamBufferRef = useRef({ chatId: null, content: '', rafPending: false, rafId: null });
  const flushStreamBuffer = useCallback(() => {
    const buf = streamBufferRef.current;
    if (!buf.content || !buf.chatId) return;
    const content = buf.content;
    buf.content = '';
    buf.rafPending = false;
    buf.rafId = null;
    const chatId = buf.chatId;
    updateChatMessages(chatId, (prev) => {
      const updated = [...prev];
      const last = updated[updated.length - 1];
      if (last && last.role === 'assistant') {
        updated[updated.length - 1] = { ...last, content: last.content + content };
      }
      return updated;
    });
  }, []);

  const bufferDelta = useCallback((chatId, delta) => {
    const buf = streamBufferRef.current;
    buf.chatId = chatId;
    buf.content += delta;
    if (!buf.rafPending) {
      buf.rafPending = true;
      buf.rafId = requestAnimationFrame(flushStreamBuffer);
    }
  }, [flushStreamBuffer]);

  // ── API Keys ──
  const [apiKeys, setApiKeys] = useState(() => loadFromStorage(LS_KEYS.apiKeys, []));
  const [activeKeyId, setActiveKeyId] = useState(() => loadFromStorage(LS_KEYS.activeKeyId, null));
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => loadFromStorage(LS_KEYS.sidebarCollapsed, false));

  // ── Custom prompt ──
  const [customPrompt, setCustomPrompt] = useState(() => loadFromStorage(LS_KEYS.customPrompt, ''));

  // ── SearXNG URL ──
  const [searxngUrl, setSearxngUrl] = useState(() => loadFromStorage(LS_KEYS.searxngUrl, DEFAULT_SEARXNG_URL));

  // ── Prompt System / Prompt Upgrader toggles ──
  const [promptSystemEnabled, setPromptSystemEnabled] = useState(() => loadFromStorage(LS_KEYS.promptSystemEnabled, false));
  const [promptUpgraderEnabled, setPromptUpgraderEnabled] = useState(() => loadFromStorage(LS_KEYS.promptUpgraderEnabled, false));
  const [autoUpgrading, setAutoUpgrading] = useState(false); // true while an automatic upgrade is running
  const [promptUpgrade, setPromptUpgrade] = useState(null); // { original, upgraded, isLoading, error } | null

  // ── AI Boosts settings ──
  const [boosts, setBoosts] = useState(() => ({ ...DEFAULT_BOOSTS, ...loadFromStorage(LS_KEYS.boosts, {}) }));
  const handleBoostsChange = useCallback((patch) => setBoosts((prev) => ({ ...prev, ...patch })), []);

  // ── Memory: what Selene knows about the user (Settings → Memory) ──
  const [memory, setMemory] = useState(() => {
    const saved = loadFromStorage(LS_KEYS.memory, {});
    return { ...DEFAULT_MEMORY, ...saved, items: Array.isArray(saved?.items) ? saved.items : [] };
  });
  const memoryRef = useRef(memory);
  memoryRef.current = memory;

  // ── To-do list Selene keeps for each chat (shown in the panel on the right) ──
  const [todos, setTodos] = useState(() => {
    const saved = loadFromStorage(LS_KEYS.todos, {});
    return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
  });
  const [todoOpen, setTodoOpen] = useState(true);
  const todosRef = useRef(todos);
  todosRef.current = todos;

  // Clicking an item in the panel flips it between done and not done
  const handleToggleTodo = useCallback((chatId, id) => {
    setTodos((prev) => ({
      ...prev,
      [chatId]: (prev[chatId] || []).map((t) => (t.id === id ? { ...t, status: t.status === 'done' ? 'pending' : 'done' } : t)),
    }));
  }, []);

  const runTodoTool = useCallback((chatId, args) => {
    let list = args?.todos;
    if (typeof list === 'string') {
      try { list = JSON.parse(list); } catch { list = []; }
    }
    if (!Array.isArray(list)) return 'No list was given. Call update_todos again with a "todos" array.';
    const items = list
      .map((t) => (typeof t === 'string' ? { text: t, status: 'pending' } : t))
      .filter((t) => t && String(t.text || '').trim())
      .slice(0, 30)
      .map((t) => ({
        id: generateId(),
        text: String(t.text).trim().replace(/\s+/g, ' ').slice(0, 200),
        status: ['pending', 'in_progress', 'done'].includes(t.status) ? t.status : (t.done ? 'done' : 'pending'),
      }));
    setTodos((prev) => ({ ...prev, [chatId]: items }));
    setTodoOpen(true);
    if (items.length === 0) return 'To-do list cleared.';
    const done = items.filter((t) => t.status === 'done').length;
    return `To-do list updated: ${done} of ${items.length} done.`;
  }, []);

  const handleClearTodos = useCallback((chatId) => {
    setTodos((prev) => {
      const { [chatId]: _, ...rest } = prev;
      return rest;
    });
  }, []);

  const cleanFact = (text) => String(text || '').trim().replace(/\s+/g, ' ').slice(0, MEMORY_MAX_FACT_CHARS);

  const handleMemorySettingsChange = useCallback((patch) => setMemory((prev) => ({ ...prev, ...patch })), []);

  const handleAddMemory = useCallback((text) => {
    const fact = cleanFact(text);
    if (!fact) return;
    setMemory((prev) => ({
      ...prev,
      items: [...prev.items, { id: generateId(), text: fact, createdAt: Date.now() }].slice(-MEMORY_MAX_ITEMS),
    }));
  }, []);

  const handleEditMemory = useCallback((id, text) => {
    const fact = cleanFact(text);
    if (!fact) return;
    setMemory((prev) => ({ ...prev, items: prev.items.map((m) => (m.id === id ? { ...m, text: fact } : m)) }));
  }, []);

  const handleDeleteMemory = useCallback((id) => {
    setMemory((prev) => ({ ...prev, items: prev.items.filter((m) => m.id !== id) }));
  }, []);

  const handleClearMemory = useCallback(() => {
    setMemory((prev) => ({ ...prev, items: [] }));
  }, []);

  // Runs when Selene uses the save_memory / forget_memory tools
  const runMemoryTool = useCallback((name, args) => {
    const current = memoryRef.current;
    if (!current.enabled || !current.autoSave) return 'Memory is turned off in Settings, so nothing was changed.';

    if (name === 'save_memory') {
      const fact = cleanFact(args?.fact);
      if (!fact) return 'No fact was given.';
      if (looksLikeSecret(fact)) return 'Not saved: this looks like a password or key. Never store secrets in memory.';
      const lower = fact.toLowerCase();
      for (const m of current.items) {
        const t = m.text.toLowerCase();
        if (t === lower || t.includes(lower)) return `Already remembered: "${m.text}"`;
      }
      // A more detailed version of an existing fact replaces it instead of piling up duplicates
      const older = current.items.find((m) => lower.includes(m.text.toLowerCase()));
      const items = older
        ? current.items.map((m) => (m.id === older.id ? { ...m, text: fact } : m))
        : [...current.items, { id: generateId(), text: fact, createdAt: Date.now() }].slice(-MEMORY_MAX_ITEMS);
      const next = { ...current, items };
      memoryRef.current = next;
      setMemory(next);
      return older ? `Updated memory: "${fact}"` : `Saved to memory: "${fact}"`;
    }

    if (name === 'forget_memory') {
      const q = String(args?.query || '').trim().toLowerCase();
      if (!q) return 'No search text was given.';
      const matches = current.items.filter((m) => m.text.toLowerCase().includes(q));
      if (matches.length === 0) return `No memory matches "${q}".`;
      if (matches.length > 1) {
        return `Several memories match, so nothing was removed. Be more specific:\n${matches.map((m) => `- ${m.text}`).join('\n')}`;
      }
      const next = { ...current, items: current.items.filter((m) => m.id !== matches[0].id) };
      memoryRef.current = next;
      setMemory(next);
      return `Forgot: "${matches[0].text}"`;
    }

    return `Unknown memory tool: ${name}`;
  }, []);

  // ── Rotation indicator state ──
  const [isRotating, setIsRotating] = useState(false);

  // ── Local Ollama: online or not, and the models installed on this computer ──
  const [ollama, setOllama] = useState({ online: false, models: [], checked: false });

  // ── Your own .gguf models, started and stopped by Selene through llama-server ──
  const local = useLocalModels();

  // ── Prompts: every prompt Selene sends can be read and edited in Settings, Prompts ──
  const [promptOverrides, setPromptOverrides] = useState(() => {
    const saved = loadFromStorage(LS_KEYS.prompts, {});
    return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
  });
  const prompts = useMemo(() => mergePrompts(promptOverrides), [promptOverrides]);
  useEffect(() => { systemPromptCache.clear(); }, [prompts]); // cached prompts were built from the old texts

  const handlePromptChange = useCallback((key, text) => {
    setPromptOverrides((prev) => {
      if (text === PROMPT_DEFAULTS[key]) { const { [key]: _, ...rest } = prev; return rest; } // same as the default: nothing to remember
      return { ...prev, [key]: text };
    });
  }, []);
  const handlePromptReset = useCallback((key) => {
    setPromptOverrides((prev) => { const { [key]: _, ...rest } = prev; return rest; });
  }, []);
  const handlePromptsResetAll = useCallback(() => setPromptOverrides({}), []);

  // ── Helper agents currently working (shown above the message box) ──
  const [agentRun, setAgentRun] = useState(null); // { chatId, agents: [{ role, task, status, note }], finished } | null

  // ── Chats ──
  const [chats, setChats] = useState(() => loadFromStorage(LS_KEYS.chats, [
    { id: '1', title: 'Fixing Tauri API routing error', active: true, timestamp: Date.now(), projectId: '1' },
    { id: '2', title: 'Python loop optimization tricks', active: false, timestamp: Date.now() - 60000 },
  ]));
  const [activeChatId, setActiveChatId] = useState(() => {
    const chats = loadFromStorage(LS_KEYS.chats, []);
    return chats.find((c) => c.active)?.id || chats[0]?.id || '';
  });

  // Keep chatsRef in sync for closures
  chatsRef.current = chats;

  // ── Projects ──
  const [projects, setProjects] = useState(() => loadFromStorage(LS_KEYS.projects, []));

  // ── Messages ──
  const [chatMessages, setChatMessages] = useState(() => loadFromStorage(LS_KEYS.messages, {}));
  const messages = chatMessages[activeChatId] ?? [];
  const [inputValue, setInputValue] = useState('');
  const [streamingChatId, setStreamingChatId] = useState(null);
  const isStreaming = streamingChatId !== null;

  const updateChatMessages = useCallback((chatId, updater) => {
    setChatMessages((prev) => {
      const current = prev[chatId] ?? [];
      const next = typeof updater === 'function' ? updater(current) : updater;
      return { ...prev, [chatId]: next };
    });
  }, []);

  // ── Debounced localStorage ──
  const persistTimerRef = useRef(null);
  const persistDirtyRef = useRef(new Set());
  const persistStateRef = useRef({ chats, chatMessages, apiKeys, activeKeyId, sidebarCollapsed, customPrompt, projects, searxngUrl, promptSystemEnabled, promptUpgraderEnabled, boosts, memory, todos, promptOverrides });
  persistStateRef.current = { chats, chatMessages, apiKeys, activeKeyId, sidebarCollapsed, customPrompt, projects, searxngUrl, promptSystemEnabled, promptUpgraderEnabled, boosts, memory, todos, promptOverrides };

  const markDirty = useCallback((key) => {
    persistDirtyRef.current.add(key);
    if (persistTimerRef.current) return;
    persistTimerRef.current = setTimeout(() => {
      persistTimerRef.current = null;
      const dirty = persistDirtyRef.current;
      persistDirtyRef.current = new Set();
      const s = persistStateRef.current;
      const promises = [];
        dirty.forEach((key) => {
          switch (key) {
            case LS_KEYS.chats: promises.push(storeSet(LS_KEYS.chats, s.chats)); break;
            case LS_KEYS.messages: promises.push(storeSet(LS_KEYS.messages, s.chatMessages)); break;
            case LS_KEYS.apiKeys: promises.push(storeSet(LS_KEYS.apiKeys, s.apiKeys)); break;
            case LS_KEYS.activeKeyId: promises.push(storeSet(LS_KEYS.activeKeyId, s.activeKeyId)); break;
            case LS_KEYS.sidebarCollapsed: promises.push(storeSet(LS_KEYS.sidebarCollapsed, s.sidebarCollapsed)); break;
            case LS_KEYS.customPrompt: promises.push(storeSet(LS_KEYS.customPrompt, s.customPrompt)); break;
            case LS_KEYS.projects: promises.push(storeSet(LS_KEYS.projects, s.projects)); break;
            case LS_KEYS.searxngUrl: promises.push(storeSet(LS_KEYS.searxngUrl, s.searxngUrl)); break;
            case LS_KEYS.promptSystemEnabled: promises.push(storeSet(LS_KEYS.promptSystemEnabled, s.promptSystemEnabled)); break;
            case LS_KEYS.promptUpgraderEnabled: promises.push(storeSet(LS_KEYS.promptUpgraderEnabled, s.promptUpgraderEnabled)); break;
            case LS_KEYS.boosts: promises.push(storeSet(LS_KEYS.boosts, s.boosts)); break;
            case LS_KEYS.memory: promises.push(storeSet(LS_KEYS.memory, s.memory)); break;
            case LS_KEYS.todos: promises.push(storeSet(LS_KEYS.todos, s.todos)); break;
            case LS_KEYS.prompts: promises.push(storeSet(LS_KEYS.prompts, s.promptOverrides)); break;
          }
        });
        Promise.all(promises).catch(() => {});
    }, 300);
  }, []);

  useEffect(() => { if (initialised.current) markDirty(LS_KEYS.chats); }, [chats, markDirty]);
  useEffect(() => { if (initialised.current && streamingChatId === null) markDirty(LS_KEYS.messages); }, [chatMessages, streamingChatId, markDirty]); // not while a reply is streaming: saving every chat 3 times a second is slow
  useEffect(() => { if (initialised.current) markDirty(LS_KEYS.apiKeys); }, [apiKeys, markDirty]);
  useEffect(() => { if (initialised.current) markDirty(LS_KEYS.activeKeyId); }, [activeKeyId, markDirty]);
  useEffect(() => { if (initialised.current) markDirty(LS_KEYS.sidebarCollapsed); }, [sidebarCollapsed, markDirty]);
  useEffect(() => { if (initialised.current) markDirty(LS_KEYS.customPrompt); }, [customPrompt, markDirty]);
  useEffect(() => { if (initialised.current) markDirty(LS_KEYS.projects); }, [projects, markDirty]);
  useEffect(() => { if (initialised.current) markDirty(LS_KEYS.searxngUrl); }, [searxngUrl, markDirty]);
  useEffect(() => { if (initialised.current) markDirty(LS_KEYS.promptSystemEnabled); }, [promptSystemEnabled, markDirty]);
  useEffect(() => { if (initialised.current) markDirty(LS_KEYS.promptUpgraderEnabled); }, [promptUpgraderEnabled, markDirty]);
  useEffect(() => { if (initialised.current) markDirty(LS_KEYS.boosts); }, [boosts, markDirty]);
  useEffect(() => { if (initialised.current) markDirty(LS_KEYS.memory); }, [memory, markDirty]);
  useEffect(() => { if (initialised.current) markDirty(LS_KEYS.todos); }, [todos, markDirty]);
  useEffect(() => { if (initialised.current) markDirty(LS_KEYS.prompts); }, [promptOverrides, markDirty]);

  // ── Theme ──
  const [theme, setTheme] = useState(() => {
    const saved = loadFromStorage('luna-theme', 'dark');
    if (saved !== 'dark') document.documentElement.classList.add(saved);
    return saved;
  });

  useEffect(() => {
    storeSet('luna-theme', theme);
    document.documentElement.classList.remove('light', 'ocean', 'forest', 'midnight', 'sunset');
    if (theme !== 'dark') document.documentElement.classList.add(theme);
  }, [theme]);

  useEffect(() => {
    initStore();
    initialised.current = true;
  }, []);
  useEffect(() => {
    return () => {
      const buf = streamBufferRef.current;
      if (buf.rafId !== null) cancelAnimationFrame(buf.rafId);
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    };
  }, []);

  // ── Pending command approval (for run_command tool) ──
  const [pendingCommand, setPendingCommand] = useState(null);

  const handleApproveCommand = useCallback(() => {
    if (!pendingCommand) return;
    const { resolve, command, cwd } = pendingCommand;
    setPendingCommand(null);
    // Execute the command
    (async () => {
      try {
        const result = await executeRunCommand(command, cwd);
        resolve(result);
      } catch (err) {
        resolve(`⚠ Error: ${String(err)}`);
      }
    })();
  }, [pendingCommand]);

  const handleDenyCommand = useCallback(() => {
    if (!pendingCommand) return;
    const { resolve } = pendingCommand;
    setPendingCommand(null);
    resolve('⛔ User denied this command.');
  }, [pendingCommand]);

  async function executeRunCommand(command, cwd) {
    if (!isTauri()) {
      return `⚠ Command execution not available in browser mode.\n\`\`\`bash\n${command}\n\`\`\``;
    }
    try {
      const { Command } = await import('@tauri-apps/plugin-shell');
      const cmd = Command.create('run-script', ['-c', command], cwd ? { cwd } : undefined);
      const output = await cmd.execute();
      if (output.code === 0) {
        return output.stdout || '✅ Command completed (no output).';
      } else {
        return `⚠ Command exited with code ${output.code}:\n${output.stderr || output.stdout || '(no output)'}`;
      }
    } catch (err) {
      return `⚠ Error executing command: ${String(err)}`;
    }
  }

  // ── UI State ──
  const [showApiModal, setShowApiModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeProjectId, setActiveProjectId] = useState(null);

  // ── Project handlers ──
  const handleAddProject = useCallback((name) => {
    const colors = ['#f97316', '#8b5cf6', '#06b6d4', '#22c55e', '#ef4444', '#eab308', '#ec4899'];
    const newProject = {
      id: generateId(),
      name: name || 'New Project',
      color: colors[projects.length % colors.length],
      linkedFolder: null,
    };
    setProjects((prev) => [...prev, newProject]);
    return newProject.id;
  }, [projects.length]);

  const handleDeleteProject = useCallback((projectId) => {
    setProjects((prev) => prev.filter((p) => p.id !== projectId));
    // Unassign all chats from the deleted project
    setChats((prev) => prev.map((c) =>
      c.projectId === projectId ? { ...c, projectId: undefined } : c
    ));
    if (activeProjectId === projectId) {
      setActiveProjectId(null);
    }
  }, [activeProjectId]);

  const handleRenameProject = useCallback((projectId, name) => {
    setProjects((prev) => prev.map((p) =>
      p.id === projectId ? { ...p, name } : p
    ));
  }, []);

  const handleSetProjectFolder = useCallback((projectId, folderPath) => {
    setProjects((prev) => prev.map((p) =>
      p.id === projectId ? { ...p, linkedFolder: folderPath } : p
    ));
    systemPromptCache.clear();
  }, []);

  const handleMoveChatToProject = useCallback((chatId, projectId) => {
    setChats((prev) => prev.map((c) =>
      c.id === chatId ? { ...c, projectId: projectId || undefined } : c
    ));
  }, []);

  // ── Get linked folder from the chat's project (if any) ──
  const getChatLinkedFolder = useCallback((chatId) => {
    if (!chatId) return null;
    const chat = chats.find((c) => c.id === chatId);
    if (!chat?.projectId) return null;
    const project = projects.find((p) => p.id === chat.projectId);
    return project?.linkedFolder ?? null;
  }, [chats, projects]);

  // ── Edit / Delete / Rename handlers ──
  const handleEditMessage = useCallback((chatId, messageId, newContent) => {
    updateChatMessages(chatId, (prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, content: newContent } : m))
    );
  }, [updateChatMessages]);

  const handleDeleteMessage = useCallback((chatId, messageId) => {
    updateChatMessages(chatId, (prev) => prev.filter((m) => m.id !== messageId));
  }, [updateChatMessages]);

  const handleRenameChat = useCallback((chatId, newTitle) => {
    setChats((prev) => prev.map((c) => (c.id === chatId ? { ...c, title: newTitle } : c)));
  }, []);

  // ── Model state (global current, stored per-chat) ──
  const [activeModel, setActiveModel] = useState(PROVIDER_DEFAULT_MODEL.groq);

  // ── Derived ──
  const activeKey = apiKeys.find((k) => k.id === activeKeyId) || null;
  const providerLabel = activeKey
    ? `${PROVIDER_DISPLAY[activeKey.provider]} ${activeModel}`
    : `${PROVIDER_DISPLAY.groq} ${activeModel}`;

  // ── API Key handlers ──
  const handleAddKey = useCallback((entry) => {
    const newKey = {
      id: generateId(),
      name: entry.name,
      provider: entry.provider,
      key: entry.key,
      active: apiKeys.length === 0,
    };
    setApiKeys((prev) => [...prev, newKey]);
    if (apiKeys.length === 0) {
      setActiveKeyId(newKey.id);
      const model = PROVIDER_DEFAULT_MODEL[entry.provider];
      setActiveModel(model);
      // Store in current chat
      if (activeChatId) {
        setChats((prev) => prev.map((c) =>
          c.id === activeChatId ? { ...c, keyId: newKey.id, model } : c
        ));
      }
    }
  }, [apiKeys.length, activeChatId]);

  // ── Per-chat model/key selection ──
  const handleSelectKey = useCallback((id) => {
    setApiKeys((prev) => prev.map((k) => ({ ...k, active: k.id === id })));
    setActiveKeyId(id);
    const key = apiKeys.find((k) => k.id === id);
    if (key) {
      const model = key.provider === 'ollama' && ollama.models[0] ? ollama.models[0].name
        : key.provider === 'custom' && local.models[0] ? local.models[0].name
        : PROVIDER_DEFAULT_MODEL[key.provider];
      setActiveModel(model);
      // Persist selection to current chat
      if (activeChatId) {
        setChats((prev) => prev.map((c) =>
          c.id === activeChatId ? { ...c, keyId: id, model } : c
        ));
      }
    }
  }, [apiKeys, activeChatId, ollama.models, local.models]);

  const handleSelectModel = useCallback((model) => {
    setActiveModel(model);
    if (activeChatId) {
      setChats((prev) => prev.map((c) =>
        c.id === activeChatId ? { ...c, model } : c
      ));
    }
  }, [activeChatId]);

  // ── Local Ollama: find it, keep the model list fresh, and connect it automatically ──
  const apiKeysRef = useRef(apiKeys);
  apiKeysRef.current = apiKeys;
  const ollamaUrl = ollamaBaseUrl(apiKeys);

  const refreshOllama = useCallback(async () => {
    try {
      const models = await listOllamaModels(ollamaUrl);
      setOllama((prev) => nextOllamaState(prev, true, models));
      return true;
    } catch {
      setOllama((prev) => nextOllamaState(prev, false));
      return false;
    }
  }, [ollamaUrl]);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const models = await listOllamaModels(ollamaUrl);
        if (cancelled) return;
        setOllama((prev) => nextOllamaState(prev, true, models));
      } catch {
        if (!cancelled) setOllama((prev) => nextOllamaState(prev, false));
      }
    };
    check();
    // Keep watching only if Ollama is actually set up as a connection
    const timer = apiKeysRef.current.some((k) => k.provider === 'ollama') ? setInterval(check, 15000) : null;
    return () => { cancelled = true; if (timer) clearInterval(timer); };
  }, [ollamaUrl]);

  // Used by Settings, Local models: switch this chat to an installed Ollama model
  const handleUseOllamaModel = useCallback((name) => {
    const key = apiKeys.find((k) => k.provider === 'ollama');
    if (!key) return;
    setActiveKeyId(key.id);
    setActiveModel(name);
    if (activeChatId) {
      setChats((prev) => prev.map((c) => (c.id === activeChatId ? { ...c, keyId: key.id, model: name } : c)));
    }
  }, [apiKeys, activeChatId]);

  // Settings, Local models, Ollama: add Ollama to the model menu
  const handleConnectOllama = useCallback(() => {
    setApiKeys((prev) => (prev.some((k) => k.provider === 'ollama') ? prev : [...prev, { id: 'ollama-local', name: 'Ollama (local)', provider: 'ollama', key: OLLAMA_DEFAULT_URL, active: false }]));
  }, []);

  // Your .gguf models show up in the model menu as soon as there is one
  useEffect(() => {
    if (local.models.length === 0) return;
    if (apiKeysRef.current.some((k) => k.provider === 'custom')) return;
    const entry = { id: 'custom-local', name: 'Local models', provider: 'custom', key: 'http://127.0.0.1:8089', active: false };
    const wasEmpty = apiKeysRef.current.length === 0;
    setApiKeys((prev) => (prev.some((k) => k.provider === 'custom') ? prev : [...prev, entry]));
    if (wasEmpty) {
      setActiveKeyId(entry.id);
      setActiveModel(local.models[0].name);
    }
  }, [local.models]);

  // Used by Settings, Local models: switch this chat to one of your .gguf models
  const handleUseCustomModel = useCallback((name) => {
    let key = apiKeysRef.current.find((k) => k.provider === 'custom');
    if (!key) {
      key = { id: 'custom-local', name: 'Local models', provider: 'custom', key: 'http://127.0.0.1:8089', active: false };
      const added = key;
      setApiKeys((prev) => (prev.some((k) => k.provider === 'custom') ? prev : [...prev, added]));
    }
    setActiveKeyId(key.id);
    setActiveModel(name);
    if (activeChatId) {
      setChats((prev) => prev.map((c) => (c.id === activeChatId ? { ...c, keyId: key.id, model: name } : c)));
    }
  }, [activeChatId]);

  // ── Chat handlers ──
  const handleNewChat = useCallback(() => {
    const newChat = {
      id: generateId(),
      title: 'New chat',
      active: true,
      timestamp: Date.now(),
      projectId: activeProjectId || undefined,
    };
    setChats((prev) => prev.map((c) => ({ ...c, active: false })).concat(newChat));
    setChatMessages((prev) => ({ ...prev, [newChat.id]: [] }));
    setActiveChatId(newChat.id);
    setInputValue('');
  }, [activeProjectId]);

  const handleAddChatInProject = useCallback((projectId) => {
    const newChat = {
      id: generateId(),
      title: 'New chat',
      active: true,
      timestamp: Date.now(),
      projectId,
    };
    setChats((prev) => prev.map((c) => ({ ...c, active: false })).concat(newChat));
    setChatMessages((prev) => ({ ...prev, [newChat.id]: [] }));
    setActiveChatId(newChat.id);
    setActiveProjectId(projectId);
    setInputValue('');
  }, []);

  const handleSelectChat = useCallback((id) => {
    setChats((prev) => prev.map((c) => ({ ...c, active: c.id === id })));
    setActiveChatId(id);
    setInputValue('');
    setSearchQuery('');

    // Restore per-chat key and model selection
    const chat = chatsRef.current.find((c) => c.id === id);
    if (chat?.keyId) {
      setActiveKeyId(chat.keyId);
    }
    if (chat?.model) {
      setActiveModel(chat.model);
    }
  }, []);

  const handleDeleteChat = useCallback((chatId) => {
    setChats((prev) => prev.filter((c) => c.id !== chatId));
    setTodos((prev) => {
      const { [chatId]: _, ...rest } = prev;
      return rest;
    });
    setChatMessages((prev) => {
      const { [chatId]: _, ...rest } = prev;
      return rest;
    });
  }, []);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handleKeyDown = (e) => {
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && e.key === 'b') { e.preventDefault(); setSidebarCollapsed((c) => !c); return; }
      if (isMod && e.shiftKey && e.key === 'N') { e.preventDefault(); handleNewChat(); return; }
      if (isMod && e.key === 'k') { e.preventDefault(); const el = document.querySelector('input[placeholder="Filter chats..."]'); if (el) el.focus(); return; }
      if (e.key === 'Enter' && pendingCommand) { e.preventDefault(); handleApproveCommand(); return; }
      if (e.key === 'Escape') {
        if (pendingCommand) { handleDenyCommand(); return; }
        if (showApiModal) { setShowApiModal(false); return; }
        if (showSettingsModal) { setShowSettingsModal(false); return; }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showApiModal, showSettingsModal, handleNewChat, pendingCommand, handleApproveCommand, handleDenyCommand]);

  // ── Core fetch-and-stream ──
  const doFetchAndStream = useCallback(async (chatId, messagesToSend, userContent, keyToUse, signal, tools) => {
    // Everything except the empty assistant placeholder at the end, compacted to save tokens
    // Past reasoning is not sent back to the model (saves tokens)
    const cleanedMessages = messagesToSend
      .slice(0, -1)
      .map((m) => (m.role === 'assistant' && m.content ? { ...m, content: stripThinking(m.content) } : m))
      .filter((m) => m.role !== 'assistant' || m.content || m.tool_calls);
    const priorMessages = boosts.tokenSaver ? compactHistory(cleanedMessages, boosts.historyBudget) : cleanedMessages;
    const chatLinkedFolder = getChatLinkedFolder(chatId);

    const memoryAutoSave = memory.enabled && memory.autoSave;
    // Local .gguf model: start llama-server first if it is not running this model yet
    if (keyToUse.provider === 'custom') {
      let shownNotice = false;
      const setNotice = (text) => updateChatMessages(chatId, (prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last && last.role === 'assistant') updated[updated.length - 1] = { ...last, content: text };
        return updated;
      });
      const loadError = await local.ensureLoaded(activeModel, signal, (text) => { shownNotice = true; setNotice(text); });
      if (shownNotice) setNotice('');
      if (loadError) throw new Error(loadError);
    }

    const baseSystemPrompt = await buildSystemPrompt(chatLinkedFolder, promptSystemEnabled ? customPrompt : '', boosts.responseStyle, buildMemoryBlock(memory), memoryAutoSave, getThinkingPrompt(boosts.thinking, activeModel, prompts), getAgentsPrompt(boosts, prompts), prompts);

    // Selene sees the current to-do list (including anything the user ticked) so her next update starts from it
    const todosOn = boosts.toolTodos;
    const currentTodos = todosRef.current[chatId] || [];
    const todoHint = todosOn && prompts.todo ? '\n\n' + prompts.todo : '';
    const todoBlock = todosOn && currentTodos.length > 0
      ? '\n\n## Current to-do list\n' + currentTodos.map((t) => `- [${t.status === 'done' ? 'x' : t.status === 'in_progress' ? '~' : ' '}] ${t.text}`).join('\n') + '\n([x] done, [~] in progress, [ ] pending. The user can tick items themselves. Start your next update_todos call from this list.)'
      : '';
    const systemPrompt = baseSystemPrompt + todoHint + todoBlock;

    // A local model listens on whichever port llama-server was started on
    const endpoint = getEndpoint(keyToUse.provider === 'custom' ? { ...keyToUse, key: local.getBaseUrl() } : keyToUse);

    // Convert messages to API format, handling tool_calls and tool messages
    const apiMessages = [{ role: 'system', content: systemPrompt }];
    for (const m of priorMessages) {
      if (m.role === 'tool') {
        apiMessages.push({ role: 'tool', content: m.content, tool_call_id: m.tool_call_id });
      } else if (m.tool_calls && m.role === 'assistant') {
        apiMessages.push({
          role: 'assistant',
          content: m.content || null,
          tool_calls: m.tool_calls.map((tc) => ({
            id: tc.id,
            type: 'function',
            function: {
              name: tc.function.name,
              arguments: JSON.stringify(tc.function.arguments),
            },
          })),
        });
      } else {
        apiMessages.push({ role: m.role, content: m.content });
      }
    }

    let body;
    {
      const requestBody = {
        model: activeModel,
        messages: apiMessages,
        temperature: boosts.temperature,
        max_tokens: boosts.maxTokens + (THINKING_EXTRA_TOKENS[boosts.thinking] || 0),
        stream: true,
      };
      if (keyToUse.provider === 'groq' && /gpt-oss/i.test(activeModel) && THINKING_EFFORT[boosts.thinking]) {
        requestBody.reasoning_effort = THINKING_EFFORT[boosts.thinking];
      }
      if (tools && tools.length > 0) {
        requestBody.tools = tools;
        requestBody.tool_choice = 'auto';
      }
      body = JSON.stringify(requestBody);
    }

    const headers = { 'Content-Type': 'application/json' };
    if (keyToUse.provider !== 'ollama' && keyToUse.provider !== 'custom') {
      headers['Authorization'] = `Bearer ${keyToUse.key}`;
    }

    const response = await fetch(endpoint, { method: 'POST', headers, body, signal });

    if (!response.ok) {
      const errorData = await response.text();
      let errorMessage = `HTTP ${response.status}`;
      try { const parsed = JSON.parse(errorData); errorMessage = (typeof parsed.error === 'string' ? parsed.error : parsed.error?.message) || errorMessage; } catch {}
      // Some local models cannot use tools: try again as a plain chat
      if ((keyToUse.provider === 'ollama' || keyToUse.provider === 'custom') && tools && tools.length > 0 && /tool|jinja|template|support/i.test(errorMessage)) {
        return doFetchAndStream(chatId, messagesToSend, userContent, keyToUse, signal, undefined);
      }
      throw new Error(errorMessage);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buf = '';
    let finalContent = '';
    let reasoningOpen = false; // true while reasoning from a separate API field is being wrapped in <think>
    let toolCallsMap = null; // Map<index, { id, function: { name, arguments } }>
    let finishReason = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') continue;
        try {
          {
            const parsed = JSON.parse(data);
            const choice = parsed.choices?.[0];
            if (!choice) continue;

            // Track finish reason
            if (choice.finish_reason) {
              finishReason = choice.finish_reason;
            }

            const delta = choice.delta || {};

            // Reasoning sent in its own field (gpt-oss, DeepSeek...) is wrapped in <think> tags
            const reasoningDelta = delta.reasoning || delta.reasoning_content;
            if (reasoningDelta) {
              const out = reasoningOpen ? reasoningDelta : '<think>' + reasoningDelta;
              reasoningOpen = true;
              finalContent += out;
              bufferDelta(chatId, out);
            }

            // Handle content streaming
            if (delta.content) {
              const out = reasoningOpen ? '</think>' + delta.content : delta.content;
              reasoningOpen = false;
              finalContent += out;
              bufferDelta(chatId, out);
            }

            // Handle tool_calls streaming
            if (delta.tool_calls) {
              if (!toolCallsMap) toolCallsMap = new Map();
              for (const tc of delta.tool_calls) {
                const idx = tc.index ?? toolCallsMap.size;
                if (!toolCallsMap.has(idx)) {
                  toolCallsMap.set(idx, { id: '', function: { name: '', arguments: '' } });
                }
                const entry = toolCallsMap.get(idx);
                if (tc.id) entry.id = tc.id;
                if (tc.function?.name) entry.function.name += tc.function.name;
                if (tc.function?.arguments) entry.function.arguments += tc.function.arguments;
              }
            }
          }
        } catch {}
      }
    }

    if (reasoningOpen) {
      finalContent += '</think>';
      bufferDelta(chatId, '</think>');
    }

    // Flush remaining buffered content
    const flush = () => {
      const b = streamBufferRef.current;
      if (b.content && b.chatId === chatId) {
        const remaining = b.content;
        b.content = '';
        b.rafPending = false;
        updateChatMessages(chatId, (prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && last.role === 'assistant') {
            updated[updated.length - 1] = { ...last, content: last.content + remaining };
          }
          return updated;
        });
      }
    };
    if (streamBufferRef.current.rafPending) {
      streamBufferRef.current.rafPending = false;
      flush();
    }

    // If tool_calls were detected, parse and return them
    if (toolCallsMap && toolCallsMap.size > 0 && (finishReason === 'tool_calls' || keyToUse.provider === 'ollama')) {
      const toolCalls = Array.from(toolCallsMap.entries())
        .sort(([a], [b]) => a - b)
        .map(([_, tc]) => {
          let parsedArgs = {};
          try { parsedArgs = JSON.parse(tc.function.arguments || '{}'); } catch { parsedArgs = {}; }
          return {
            id: tc.id,
            type: 'function',
            function: { name: tc.function.name, arguments: parsedArgs },
          };
        });
      return { content: finalContent, toolCalls };
    }

    return finalContent;
  }, [activeModel, getChatLinkedFolder, bufferDelta, updateChatMessages, customPrompt, promptSystemEnabled, boosts, memory, local.ensureLoaded, local.getBaseUrl, prompts]);

  // ── Helper agents: starts the agents Selene asked for and returns their combined reports ──
  const runDelegation = useCallback(async (chatId, rawArgs, signal) => {
    if (!boosts.agentsEnabled) return 'Helper agents are turned off in Settings, so nothing was started.';
    if (!activeKey) return 'No API key is configured, so no agents were started.';
    if (activeKey.provider === 'custom') {
      const loadError = await local.ensureLoaded(activeModel, signal);
      if (loadError) return `No agents were started: ${loadError}`;
    }

    let list = rawArgs?.agents;
    if (typeof list === 'string') {
      try { list = JSON.parse(list); } catch { list = []; }
    }
    if (!Array.isArray(list)) list = [];
    list = list
      .filter((a) => a && String(a.task || '').trim())
      .map((a) => ({
        role: String(a.role || 'Agent').trim().slice(0, 40) || 'Agent',
        task: String(a.task).trim().slice(0, 1500),
      }));
    if (list.length === 0) {
      return 'No agents were started: the agents list was empty or had no tasks. Call the tool again with at least one agent that has a task.';
    }

    const max = clampAgents(boosts.maxAgents);
    let prefix = '';
    if (list.length > max) {
      list = list.slice(0, max);
      prefix = `Note: the limit is ${max} agents, so the extra ones were not started.\n\n`;
    }

    // Helper agents may only look things up. They never run commands or change files.
    const allowedTools = [];
    if (boosts.toolWebSearch) allowedTools.push('web_search');
    if (boosts.toolReadUrl) allowedTools.push('read_url');
    const tools = activeKey.provider === 'ollama' || activeKey.provider === 'custom'
      ? []
      : TOOL_DEFINITIONS.filter((t) => allowedTools.includes(t.function.name));

    const agentTokens = boosts.agentTokens || 1024;
    setAgentRun({ chatId, agents: list.map((a) => ({ ...a, status: 'waiting', note: '' })), finished: false });

    const update = (i, patch) => setAgentRun((prev) => (
      prev && prev.chatId === chatId
        ? { ...prev, agents: prev.agents.map((a, idx) => (idx === i ? { ...a, ...patch } : a)) }
        : prev
    ));

    try {
      const reports = await runAgents({
        agents: list,
        sharedContext: String(rawArgs?.shared_context || '').slice(0, 2000),
        key: activeKey.provider === 'custom' ? { ...activeKey, key: local.getBaseUrl() } : activeKey,
        prompts,
        model: activeModel,
        maxTokens: agentTokens + (isReasoningModel(activeModel) ? 1500 : 0), // reasoning models spend tokens thinking first
        reasoningEffort: activeKey.provider === 'groq' && /gpt-oss/i.test(activeModel) ? 'low' : undefined,
        tools,
        runTool: (name, a) => executeTool(name, a, searxngUrl),
        capOutput: (text) => capToolOutput(text, 3000),
        reportChars: Math.min(agentTokens * 3, Math.floor(20000 / list.length)),
        signal,
        onUpdate: update,
      });
      return prefix + reports;
    } finally {
      setAgentRun((prev) => (prev && prev.chatId === chatId ? { ...prev, finished: true } : prev));
      setTimeout(() => setAgentRun((prev) => (prev && prev.chatId === chatId ? null : prev)), 2500);
    }
  }, [boosts, activeKey, activeModel, searxngUrl, local.ensureLoaded, local.getBaseUrl, prompts]);

  // ── Streaming helper with automatic key rotation + tool calling ──
  const streamResponse = useCallback(async (chatId, messagesToSend, userContent, depth = 0) => {
    if (!activeKey) {
      updateChatMessages(chatId, (prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last && last.role === 'assistant' && !last.content) {
          updated[updated.length - 1] = { ...last, content: '⚠ Error: No API key configured' };
        }
        return updated;
      });
      return;
    }

    const providerKeys = getProviderKeys(apiKeys, activeKey.provider);
    const triedKeyIds = new Set();
    let currentKey = activeKey;
    let lastError = null;
    let rotated = false;
    let rotationChain = [];
    let retryCount = 0;
    // Limit tool call depth to prevent infinite loops
    if (depth > 5) {
      updateChatMessages(chatId, (prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last && last.role === 'assistant' && !last.content) {
          updated[updated.length - 1] = { ...last, content: '⚠ Reached maximum tool call depth. Please try a simpler request.' };
        }
        return updated;
      });
      return '⚠ Max tool depth reached';
    }
    const toolsToSend = depth < 5 ? getEnabledTools(boosts, memory) : undefined;

    while (triedKeyIds.size < providerKeys.length) {
      triedKeyIds.add(currentKey.id);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        if (rotated) setIsRotating(true);

        let finalContent;
        try {
          finalContent = await doFetchAndStream(
            chatId, messagesToSend, userContent, currentKey, controller.signal, toolsToSend
          );
        } finally {
          abortRef.current = null;
        }

        if (rotated) {
          setIsRotating(false);
          setActiveKeyId(currentKey.id);
          const keyNames = rotationChain.join(' → ');
          updateChatMessages(chatId, (prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last && last.role === 'assistant') {
              updated[updated.length - 1] = { ...last, content: last.content + `\n\n---\n🔄 **Key rotated:** ${keyNames}` };
            }
            return updated;
          });
        }

        // Check if tool_calls were returned
        if (finalContent && typeof finalContent === 'object' && finalContent.toolCalls) {
          const { toolCalls } = finalContent;

          // Update the last assistant message with tool_calls data
          updateChatMessages(chatId, (prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last && last.role === 'assistant') {
              updated[updated.length - 1] = { ...last, tool_calls: toolCalls };
            }
            return updated;
          });

          // Execute tools: commands need approval, others auto-run
          const toolResults = [];
          let stopped = false; // set when the user presses Stop while helper agents are running
          for (const tc of toolCalls) {
            const name = tc.function.name;
            const args = tc.function.arguments;

            let output;
            if (name === 'run_command') {
              // Commands start in the chat's project folder (if it has one)
              const cmdText = String(args.command || '');
              const cmdFolder = getChatLinkedFolder(chatId);
              const mode = boosts.commandApproval;
              if (mode === 'always' || (mode === 'safe' && isSafeReadCommand(cmdText, cmdFolder))) {
                output = await executeRunCommand(cmdText, cmdFolder);
              } else {
                // Wait for user approval
                output = await new Promise((resolve) => {
                  setPendingCommand({
                    command: cmdText,
                    description: args.description || '',
                    chatId,
                    cwd: cmdFolder,
                    resolve,
                  });
                });
              }
            } else if (name === 'save_memory' || name === 'forget_memory') {
              output = runMemoryTool(name, args);
            } else if (name === 'update_todos') {
              output = runTodoTool(chatId, args);
            } else if (name === 'delegate_to_agents') {
              const agentController = new AbortController();
              abortRef.current = agentController;
              try {
                output = await runDelegation(chatId, args, agentController.signal);
              } catch (err) {
                output = agentController.signal.aborted ? 'The user stopped the agents.' : `⚠ Error running agents: ${String(err)}`;
              } finally {
                abortRef.current = null;
              }
              if (agentController.signal.aborted) stopped = true;
            } else {
              try {
                output = await executeTool(name, args, searxngUrl);
              } catch (err) {
                output = `⚠ Error executing ${name}: ${String(err)}`;
              }
            }
            toolResults.push({ tool_call_id: tc.id, output: capToolOutput(output, name === 'delegate_to_agents' ? 0 : boosts.toolOutputLimit) });
          }

          // Add tool result messages to chat
          const toolMessages = toolResults.map((r) => ({
            id: generateId(),
            role: 'tool',
            tool_call_id: r.tool_call_id,
            content: r.output,
            timestamp: Date.now(),
          }));

          // If the user stopped while agents were working, keep the results but do not continue
          if (stopped) {
            updateChatMessages(chatId, (prev) => [...prev, ...toolMessages]);
            return;
          }

          // Add the tool results AND a fresh assistant message for the follow-up to stream into
          const followUpPlaceholder = { id: generateId(), role: 'assistant', content: '', timestamp: Date.now() };
          updateChatMessages(chatId, (prev) => [...prev, ...toolMessages, followUpPlaceholder]);

          // The assistant message must carry its tool_calls so the API can match tool results to them
          const lastIdx = messagesToSend.length - 1;
          const followUpMsgs = [
            ...messagesToSend.slice(0, lastIdx),
            { ...messagesToSend[lastIdx], content: finalContent.content || '', tool_calls: toolCalls },
            ...toolMessages,
            followUpPlaceholder,
          ];

          // Make follow-up API call (recursive, with depth guard)
          return await streamResponse(chatId, followUpMsgs, userContent, depth + 1);
        }

        // No tool calls — return the content string as before
        return finalContent;
      } catch (err) {
        abortRef.current = null;
        setIsRotating(false);

        if (err?.name === 'AbortError') return;
        lastError = err;
        if (!isRetryableError(err)) break;

        const nextId = getNextKeyId(apiKeys, activeKey.provider, currentKey.id);
        if (!nextId || triedKeyIds.has(nextId)) {
          // No other key to rotate to: if the provider only asks us to wait a few seconds, wait and retry
          const waitMs = boosts.autoRetry ? parseRetryWaitMs(err) : null;
          if (waitMs !== null && retryCount < 2) {
            retryCount++;
            const setNotice = (text) => updateChatMessages(chatId, (prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last && last.role === 'assistant') updated[updated.length - 1] = { ...last, content: text };
              return updated;
            });
            setNotice(`⏳ Rate limited. Retrying in ${Math.ceil(waitMs / 1000)}s...`);
            await new Promise((r) => setTimeout(r, waitMs));
            setNotice('');
            triedKeyIds.delete(currentKey.id);
            continue;
          }
          break;
        }

        const nextKey = apiKeys.find((k) => k.id === nextId);
        if (!nextKey) break;

        rotationChain.push(currentKey.name || currentKey.key.slice(0, 8));
        currentKey = nextKey;
        rotated = true;
      }
    }

    setIsRotating(false);
    const errorMessage = lastError instanceof Error ? lastError.message : 'An unknown error occurred';
    updateChatMessages(chatId, (prev) => {
      const updated = [...prev];
      const last = updated[updated.length - 1];
      if (last && last.role === 'assistant' && !last.content) {
        const prefix = rotated ? `⚠ All ${providerKeys.length} keys exhausted.\n` : '';
        updated[updated.length - 1] = { ...last, content: `${prefix}⚠ Error: ${errorMessage}` };
      }
      return updated;
    });
  }, [activeKey, activeModel, apiKeys, searxngUrl, updateChatMessages, getChatLinkedFolder, doFetchAndStream, executeTool, boosts, memory, runMemoryTool, runDelegation]);

  // ── Send message ──
  const doSend = useCallback(async (contentOverride) => {
    const userContent = contentOverride ?? inputValue.trim();
    if (!userContent || !activeKey || streamingChatId === activeChatId) return;

    const chatId = activeChatId;
    const priorMessages = chatMessages[chatId] ?? [];
    const chatLinkedFolder = getChatLinkedFolder(chatId);

    const userMessage = { id: generateId(), role: 'user', content: userContent, timestamp: Date.now() };
    const assistantMessage = { id: generateId(), role: 'assistant', content: '', timestamp: Date.now() };
    const newMsgs = [...priorMessages, userMessage, assistantMessage];

    updateChatMessages(chatId, newMsgs);
    setInputValue('');
    setStreamingChatId(chatId);

    // The first message names the chat; every message moves it to the top of Recents
    const newTitle = priorMessages.length === 0
      ? (userContent.length > 40 ? userContent.slice(0, 40) + '...' : userContent)
      : null;
    setChats((prev) => prev.map((c) => (c.id === chatId ? { ...c, ...(newTitle ? { title: newTitle } : {}), timestamp: Date.now() } : c)));

    let responseContent;
    try {
      responseContent = await streamResponse(chatId, newMsgs, userContent);
    } finally {
      setStreamingChatId(null);
    }

    if (chatLinkedFolder && isTauri() && responseContent) {
      const writes = parseFileWrites(responseContent);
      if (writes.length > 0) {
        const writeResults = [];
        for (const w of writes) {
          const fullPath = chatLinkedFolder.endsWith('/') || chatLinkedFolder.endsWith('\\')
            ? `${chatLinkedFolder}${w.path}` : `${chatLinkedFolder}/${w.path}`;
          const err = await writeFile(fullPath, w.content);
          writeResults.push(err ? `⚠ ${w.path}: ${err}` : `✅ Wrote \`${w.path}\``);
        }
        updateChatMessages(chatId, (prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && last.role === 'assistant') {
            updated[updated.length - 1] = { ...last, content: last.content + `\n\n---\n📝 **Files written:**\n${writeResults.join('\n')}` };
          }
          return updated;
        });
      }
    }
  }, [inputValue, activeKey, chatMessages, streamingChatId, activeChatId, updateChatMessages, streamResponse, getChatLinkedFolder]);

  const handleSendSuggestion = useCallback((text) => { setInputValue(''); doSend(text); }, [doSend]);

  // ── Prompt Upgrader: sends the draft to the AI for a rewrite before the real send ──
  const runPromptUpgrade = useCallback(async (original, opts = {}) => {
    // opts.silent = no popup (auto mode) | opts.refine + opts.previous = adjust the last upgrade
    const show = (state) => { if (!opts.silent) setPromptUpgrade(state); };
    show({ original, upgraded: '', isLoading: true, error: null });

    if (!activeKey) {
      show({ original, upgraded: '', isLoading: false, error: 'No API key configured.' });
      return null;
    }

    try {
      // A local model may not be running yet: start it first
      if (activeKey.provider === 'custom') {
        const loadError = await local.ensureLoaded(activeModel);
        if (loadError) throw new Error(loadError);
      }
      const endpoint = getEndpoint(activeKey.provider === 'custom' ? { ...activeKey, key: local.getBaseUrl() } : activeKey);
      const sysMsg = buildUpgraderPrompt(boosts.upgraderStyle, opts.refine, prompts);

      // Optional background so the rewrite fits the project and the conversation
      let userMsg = original;
      if (boosts.upgraderContext) {
        const folder = getChatLinkedFolder(activeChatId);
        const recent = (chatMessages[activeChatId] || [])
          .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.content)
          .slice(-2)
          .map((m) => `${m.role === 'user' ? 'User' : 'Selene'}: ${stripThinking(m.content).slice(0, 300)}`);
        const ctx = [];
        if (folder) ctx.push(`Project folder: ${folder}`);
        if (recent.length > 0) ctx.push(`Recent conversation:\n${recent.join('\n')}`);
        if (ctx.length > 0) userMsg = `Background (only to understand the message, never repeat it):\n${ctx.join('\n')}\n\n---\nMessage to improve:\n${original}`;
      }
      if (opts.refine && opts.previous) userMsg += `\n\nPrevious upgrade to adjust:\n${opts.previous}`;

      const msgs = [{ role: 'system', content: sysMsg }, { role: 'user', content: userMsg }];
      const requestBody = activeKey.provider === 'ollama'
        ? { model: activeModel, messages: msgs, stream: false }
        : {
            model: activeModel, messages: msgs, temperature: 0.5, stream: false,
            // reasoning models spend tokens thinking first, so give them room and keep it short
            max_tokens: 1024 + (isReasoningModel(activeModel) ? 1500 : 0),
            ...(activeKey.provider === 'groq' && /gpt-oss/i.test(activeModel) ? { reasoning_effort: 'low' } : {}),
          };

      const headers = { 'Content-Type': 'application/json' };
      if (activeKey.provider !== 'ollama' && activeKey.provider !== 'custom') headers['Authorization'] = `Bearer ${activeKey.key}`;

      const resp = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(requestBody) });

      if (!resp.ok) {
        const errText = await resp.text();
        let msg = `HTTP ${resp.status}`;
        try { msg = JSON.parse(errText).error?.message || msg; } catch {}
        throw new Error(msg);
      }

      const data = await resp.json();
      const text = data.choices?.[0]?.message?.content || data.message?.content || '';

      // Drop reasoning and wrapping quotes the model may have added
      const trimmedText = stripThinking(text).trim().replace(/^["\u201C]([\s\S]*)["\u201D]$/, '$1').trim();
      show({ original, upgraded: trimmedText, isLoading: false, error: trimmedText ? null : 'No response received.' });
      return trimmedText || null;
    } catch (err) {
      show({ original, upgraded: '', isLoading: false, error: (err && err.message) || 'Failed to upgrade prompt.' });
      return null;
    }
  }, [activeKey, activeModel, boosts.upgraderStyle, boosts.upgraderContext, chatMessages, activeChatId, getChatLinkedFolder, local.ensureLoaded, local.getBaseUrl, prompts]);

  const handleSend = useCallback(async () => {
    const trimmed = inputValue.trim();
    if (!trimmed || !activeKey || streamingChatId === activeChatId || autoUpgrading) return;
    if (promptUpgraderEnabled && !(boosts.upgraderSkipShort && isTooShortToUpgrade(trimmed))) {
      if (boosts.upgraderAuto) {
        // Auto mode: upgrade quietly and send; if it fails, send the original
        setAutoUpgrading(true);
        let better = null;
        try { better = await runPromptUpgrade(trimmed, { silent: true }); } finally { setAutoUpgrading(false); }
        setInputValue('');
        doSend(better || trimmed);
        return;
      }
      runPromptUpgrade(trimmed);
      return;
    }
    doSend();
  }, [inputValue, activeKey, streamingChatId, activeChatId, autoUpgrading, promptUpgraderEnabled, boosts.upgraderSkipShort, boosts.upgraderAuto, runPromptUpgrade, doSend]);

  const handleUpgradeUseUpgraded = useCallback((edited) => {
    if (!promptUpgrade) return;
    const text = (typeof edited === 'string' ? edited : promptUpgrade.upgraded || '').trim();
    if (!text) return;
    setPromptUpgrade(null);
    setInputValue('');
    doSend(text);
  }, [promptUpgrade, doSend]);

  const handleUpgradeUseOriginal = useCallback(() => {
    if (!promptUpgrade) return;
    const text = promptUpgrade.original;
    setPromptUpgrade(null);
    setInputValue('');
    doSend(text);
  }, [promptUpgrade, doSend]);

  const handleUpgradeRetry = useCallback(() => {
    if (!promptUpgrade) return;
    runPromptUpgrade(promptUpgrade.original);
  }, [promptUpgrade, runPromptUpgrade]);

  const handleUpgradeRefine = useCallback((kind) => {
    if (!promptUpgrade || !promptUpgrade.upgraded) return;
    runPromptUpgrade(promptUpgrade.original, { refine: kind, previous: promptUpgrade.upgraded });
  }, [promptUpgrade, runPromptUpgrade]);

  const handleUpgradeCancel = useCallback(() => {
    setPromptUpgrade(null);
  }, []);

  const handleTogglePromptSystem = useCallback((val) => {
    setPromptSystemEnabled(val);
  }, []);

  const handleTogglePromptUpgrader = useCallback((val) => {
    setPromptUpgraderEnabled(val);
  }, []);

  const handleStopGeneration = useCallback(() => {
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }
    setStreamingChatId(null);
  }, []);

  const handleRegenerate = useCallback(async (chatId) => {
    const msgs = chatMessages[chatId] ?? [];
    const lastUserIdx = msgs.map((m) => m.role).lastIndexOf('user');
    if (lastUserIdx === -1) return;

    const lastUserMsg = msgs[lastUserIdx];
    const chatLinkedFolder = getChatLinkedFolder(chatId);
    const withoutLastAssistant = msgs[msgs.length - 1]?.role === 'assistant' ? msgs.slice(0, -1) : msgs;
    const newAssistant = { id: generateId(), role: 'assistant', content: '', timestamp: Date.now() };
    const newMsgs = [...withoutLastAssistant, newAssistant];

    setChatMessages((prev) => ({ ...prev, [chatId]: newMsgs }));
    setStreamingChatId(chatId);
    let responseContent;
    try {
      responseContent = await streamResponse(chatId, newMsgs, lastUserMsg.content);
    } finally {
      setStreamingChatId(null);
    }

    if (chatLinkedFolder && isTauri() && responseContent && !parseFileReads(responseContent).length) {
      const writes = parseFileWrites(responseContent);
      if (writes.length > 0) {
        const writeResults = [];
        for (const w of writes) {
          const fullPath = chatLinkedFolder.endsWith('/') || chatLinkedFolder.endsWith('\\')
            ? `${chatLinkedFolder}${w.path}` : `${chatLinkedFolder}/${w.path}`;
          const err = await writeFile(fullPath, w.content);
          writeResults.push(err ? `⚠ ${w.path}: ${err}` : `✅ Wrote \`${w.path}\``);
        }
        updateChatMessages(chatId, (prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && last.role === 'assistant') {
            updated[updated.length - 1] = { ...last, content: last.content + `\n\n---\n📝 **Files written:**\n${writeResults.join('\n')}` };
          }
          return updated;
        });
      }
    }
  }, [chatMessages, streamResponse, getChatLinkedFolder]);

  // Stable wrapper, so the message list is not redrawn on every streamed chunk
  const regenerateRef = useRef(null);
  regenerateRef.current = handleRegenerate;
  const handleRegenerateStable = useCallback((chatId) => regenerateRef.current && regenerateRef.current(chatId), []);

  // ── SearXNG auto-setup handler ──
  const [setupSearxngStatus, setSetupSearxngStatus] = useState(null);

  const handleSetupSearXNG = useCallback(async () => {
    setSetupSearxngStatus('🔍 Checking if SearXNG is already running...');
    const running = await checkSearxngRunning(searxngUrl);
    if (running) {
      setSetupSearxngStatus('✅ SearXNG is already running on ' + searxngUrl);
      setTimeout(() => setSetupSearxngStatus(null), 5000);
      return;
    }

    if (!isTauri()) {
      setSetupSearxngStatus('⚠ Auto-setup requires the Tauri desktop app.');
      return;
    }

    setSetupSearxngStatus('🚀 Setting up SearXNG...');
    const configDir = `${isTauri() ? (await (await import('@tauri-apps/api/path')).appDataDir()) : '~'}/luna-searxng`;
    const result = await startSearxng(configDir);
    setSetupSearxngStatus(result.message);

    if (result.success) {
      setSetupSearxngStatus('⏳ Waiting for SearXNG to be ready...');
      const ready = await waitForSearxng(searxngUrl);
      if (ready) {
        setSetupSearxngStatus('✅ SearXNG is ready on ' + searxngUrl);
        setTimeout(() => setSetupSearxngStatus(null), 10000);
      } else {
        setSetupSearxngStatus('⚠ SearXNG may not be ready yet.');
      }
    }
  }, [searxngUrl]);

  // ── [read:...] marker processing ──
  const processedReadMessagesRef = useRef(new Set());

  useEffect(() => {
    if (!activeChatId || streamingChatId !== null) return;

    const msgs = chatMessages[activeChatId] ?? [];
    const lastMsg = msgs[msgs.length - 1];
    if (!lastMsg || lastMsg.role !== 'assistant') return;
    if (processedReadMessagesRef.current.has(lastMsg.id)) return;

    const chatLinkedFolder = getChatLinkedFolder(activeChatId);
    if (!chatLinkedFolder || !isTauri()) return;

    const reads = parseFileReads(lastMsg.content);
    if (reads.length === 0) return;

    processedReadMessagesRef.current.add(lastMsg.id);

    (async () => {
      let modifiedContent = lastMsg.content;
      const readInfo = [];

      for (const r of reads) {
        const fullPath = chatLinkedFolder.endsWith('/') || chatLinkedFolder.endsWith('\\')
          ? `${chatLinkedFolder}${r.path}` : `${chatLinkedFolder}/${r.path}`;
        const result = await readFile(fullPath);
        if (result.content && boosts.fileReadLimit > 0 && result.content.length > boosts.fileReadLimit) {
          result.content = result.content.slice(0, boosts.fileReadLimit) + '\n...[file truncated by file read limit]';
        }
        const replacement = result.error
          ? `\n\`\`\`\n${result.error}\n\`\`\``
          : `\n\`\`\`${r.path}\n${result.content}\n\`\`\``;
        modifiedContent = modifiedContent.replace(r.original, replacement);
        if (result.content) readInfo.push(`📖 ${r.path}`);
      }

      updateChatMessages(activeChatId, (prev) => {
        const updated = [...prev];
        for (let i = updated.length - 1; i >= 0; i--) {
          if (updated[i].id === lastMsg.id) { updated[i] = { ...updated[i], content: modifiedContent }; break; }
        }
        return updated;
      });

      const followUpUser = {
        id: generateId(), role: 'user',
        content: '[System: Files requested above have been loaded. Continue with your response now that you can see them.]',
        timestamp: Date.now(),
      };
      const followUpAssistant = { id: generateId(), role: 'assistant', content: '', timestamp: Date.now() };
      const priorContext = chatMessages[activeChatId] ?? [];
      const updatedPrior = priorContext.map((m) => m.id === lastMsg.id ? { ...m, content: modifiedContent } : m);
      const followUpMsgs = [...updatedPrior, followUpUser, followUpAssistant];

      updateChatMessages(activeChatId, (prev) => {
        const updated = [...prev];
        for (let i = updated.length - 1; i >= 0; i--) {
          if (updated[i].id === lastMsg.id) { updated[i] = { ...updated[i], content: modifiedContent }; break; }
        }
        return [...updated, followUpUser, followUpAssistant];
      });

      const followUpContent = await streamResponse(activeChatId, followUpMsgs, followUpUser.content);
      if (followUpContent) {
        setTimeout(() => {
          const current = chatMessages[activeChatId] ?? [];
          const lastAssistant = current[current.length - 1];
          if (lastAssistant && lastAssistant.role === 'assistant' && lastAssistant.content === followUpContent) {
            processedReadMessagesRef.current.add(lastAssistant.id);
          }
        }, 100);

        updateChatMessages(activeChatId, (prev) => {
          const updated = [...prev];
          for (let i = updated.length - 1; i >= 0; i--) {
            if (updated[i].role === 'assistant' && !updated[i].content.startsWith('⚠') && i > 0) {
              updated[i] = { ...updated[i], content: updated[i].content + `\n\n---\n📚 **Files read:** ${readInfo.join(', ')}` };
              break;
            }
          }
          return updated;
        });

        if (chatLinkedFolder && isTauri()) {
          const writes = parseFileWrites(modifiedContent + '\n\n' + followUpContent);
          if (writes.length > 0) {
            const writeResults = [];
            for (const w of writes) {
              const fullPath = chatLinkedFolder.endsWith('/') || chatLinkedFolder.endsWith('\\')
                ? `${chatLinkedFolder}${w.path}` : `${chatLinkedFolder}/${w.path}`;
              const err = await writeFile(fullPath, w.content);
              writeResults.push(err ? `⚠ ${w.path}: ${err}` : `✅ Wrote \`${w.path}\``);
            }
            updateChatMessages(activeChatId, (prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last && last.role === 'assistant') {
                updated[updated.length - 1] = { ...last, content: last.content + `\n\n---\n📝 **Files written:**\n${writeResults.join('\n')}` };
              }
              return updated;
            });
          }
        }
      }
    })();
  }, [chatMessages, activeChatId, streamingChatId, getChatLinkedFolder, updateChatMessages, streamResponse, boosts.fileReadLimit]);

  return (
    <div className="bg-[var(--cl-bg)] text-[var(--cl-text)] h-full w-full flex overflow-hidden antialiased">
      <Sidebar
        chats={chats}
        projects={projects}
        activeChatId={activeChatId}
        activeProjectId={activeProjectId}
        collapsed={sidebarCollapsed}
        searchQuery={searchQuery}
        onNewChat={handleNewChat}
        onSelectChat={handleSelectChat}
        onRenameChat={handleRenameChat}
        onDeleteChat={handleDeleteChat}
        onManageKeys={() => setShowApiModal(true)}
        onSettings={() => setShowSettingsModal(true)}
        onSearchChange={setSearchQuery}
        onSelectProject={setActiveProjectId}
        onAddProject={handleAddProject}
        onDeleteProject={handleDeleteProject}
        onRenameProject={handleRenameProject}
        onSetProjectFolder={handleSetProjectFolder}
        onMoveChatToProject={handleMoveChatToProject}
        onAddChatInProject={handleAddChatInProject}
      />

      <main className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden w-full">
        <Header
          providerLabel={providerLabel}
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={() => setSidebarCollapsed((c) => !c)}
          onManageKeys={() => setShowApiModal(true)}
          apiKeys={apiKeys}
          activeKeyId={activeKeyId}
          activeModel={activeModel}
          onSelectKey={handleSelectKey}
          onSelectModel={handleSelectModel}
          isRotating={isRotating}
          ollama={ollama}
          customModels={local.models}
          onExportChat={messages.length > 0 ? () => {
            const chat = chats.find((c) => c.id === activeChatId);
            if (chat) exportChatAsMarkdown(chat, messages);
          } : null}
        />

        <ChatArea
          key={activeChatId || 'empty'}
          messages={messages}
          isStreaming={streamingChatId === activeChatId}
          onSendSuggestion={handleSendSuggestion}
          onEditMessage={handleEditMessage}
          onDeleteMessage={handleDeleteMessage}
          onRegenerate={handleRegenerateStable}
          activeChatId={activeChatId}
        />

        {agentRun && agentRun.chatId === activeChatId && <AgentPanel run={agentRun} />}

        {/* Command approval bar */}
        {pendingCommand && (
          <div className="flex items-center gap-3 px-4 py-2.5 mx-3 mb-2 rounded-xl border border-amber-500/30 bg-amber-500/5 animate-fade-in">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-amber-400 uppercase tracking-wider">Approve Command</p>
              <p className="text-sm text-[var(--cl-text)] mt-0.5 font-mono truncate">{pendingCommand.description || pendingCommand.command}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={handleDenyCommand}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--cl-border)] text-[var(--cl-text-2)] hover:bg-[var(--cl-hover)] hover:text-red-400 hover:border-red-400/30 transition-all"
              >
                Deny
              </button>
              <button
                onClick={handleApproveCommand}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 hover:bg-amber-500/30 hover:text-amber-200 transition-all active:scale-[0.97]"
              >
                Approve
              </button>
            </div>
          </div>
        )}

        <InputBox
          value={inputValue}
          onChange={setInputValue}
          onSend={handleSend}
          onStop={handleStopGeneration}
          onNewChat={handleNewChat}
          thinking={boosts.thinking}
          onThinkingChange={(v) => handleBoostsChange({ thinking: v })}
          disabled={!activeKey || streamingChatId === activeChatId || autoUpgrading}
          isStreaming={isStreaming}
          placeholder={!activeKey ? 'Add an API key to start chatting...' : autoUpgrading ? 'Upgrading your prompt...' : undefined}
        />
      </main>

      {todoOpen && (todos[activeChatId] || []).length > 0 && (
        <TodoPanel
          items={todos[activeChatId]}
          onClose={() => setTodoOpen(false)}
          onToggle={(id) => handleToggleTodo(activeChatId, id)}
          onClear={() => handleClearTodos(activeChatId)}
        />
      )}

      <ApiModal
        isOpen={showApiModal}
        keys={apiKeys}
        activeKeyId={activeKeyId}
        onClose={() => setShowApiModal(false)}
        onAddKey={handleAddKey}
        onSelectKey={handleSelectKey}
      />

      <SettingsModal
        isOpen={showSettingsModal}
        chatCount={chats.length}
        apiKeys={apiKeys}
        theme={theme}
        customPrompt={customPrompt}
        searxngUrl={searxngUrl}
        promptSystemEnabled={promptSystemEnabled}
        promptUpgraderEnabled={promptUpgraderEnabled}
        onTogglePromptSystem={handleTogglePromptSystem}
        boosts={boosts}
        onBoostsChange={handleBoostsChange}
        onResetBoosts={() => setBoosts({ ...DEFAULT_BOOSTS })}
        memory={memory}
        onMemorySettingsChange={handleMemorySettingsChange}
        onAddMemory={handleAddMemory}
        onEditMemory={handleEditMemory}
        onDeleteMemory={handleDeleteMemory}
        onClearMemory={handleClearMemory}
        onTogglePromptUpgrader={handleTogglePromptUpgrader}
        onCustomPromptChange={setCustomPrompt}
        onSearxngUrlChange={setSearxngUrl}
        onSetupSearxng={handleSetupSearXNG}
        setupSearxngStatus={setupSearxngStatus}
        ollama={ollama}
        ollamaUrl={ollamaUrl}
        activeProvider={activeKey?.provider}
        activeModel={activeModel}
        onOllamaRefresh={refreshOllama}
        onUseOllamaModel={handleUseOllamaModel}
        local={local}
        onUseCustomModel={handleUseCustomModel}
        ollamaConnected={apiKeys.some((k) => k.provider === 'ollama')}
        onConnectOllama={handleConnectOllama}
        promptOverrides={promptOverrides}
        onPromptChange={handlePromptChange}
        onPromptReset={handlePromptReset}
        onPromptsResetAll={handlePromptsResetAll}
        onClose={() => setShowSettingsModal(false)}
        onClearChats={() => {
          setChatMessages({});
          setChats([]);
          setActiveChatId('');
          setSearchQuery('');
        }}
        onOpenApiModal={() => setShowApiModal(true)}
        onThemeChange={setTheme}
      />

      <PromptUpgradeModal
        isOpen={!!promptUpgrade}
        original={promptUpgrade?.original ?? ''}
        upgraded={promptUpgrade?.upgraded ?? ''}
        isLoading={promptUpgrade?.isLoading ?? false}
        error={promptUpgrade?.error ?? null}
        onUseUpgraded={handleUpgradeUseUpgraded}
        onUseOriginal={handleUpgradeUseOriginal}
        onRetry={handleUpgradeRetry}
        onRefine={handleUpgradeRefine}
        onCancel={handleUpgradeCancel}
      />
    </div>
  );
}
