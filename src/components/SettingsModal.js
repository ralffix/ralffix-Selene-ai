import { useState, useEffect, useRef } from 'react';
import { PROVIDER_DISPLAY } from '../types';
import LocalModelsTab from './LocalModelsTab';
import PromptsPanel from './PromptsPanel';

const THEMES = [
  { id: 'dark', name: 'Dark', desc: 'Easy on the eyes', accent: '#c96442' },
  { id: 'light', name: 'Light', desc: 'Bright and clean', accent: '#c96442' },
  { id: 'ocean', name: 'Ocean', desc: 'Deep blue vibes', accent: '#38bdf8' },
  { id: 'forest', name: 'Forest', desc: 'Natural greens', accent: '#4ade80' },
  { id: 'midnight', name: 'Midnight', desc: 'Rich purple dark', accent: '#a78bfa' },
  { id: 'sunset', name: 'Sunset', desc: 'Warm orange glow', accent: '#fb923c' },
];

const navItems = [
  { id: 'general', label: 'General' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'api-config', label: 'API Config' },
  { id: 'local-models', label: 'Local models' },
  { id: 'prompts', label: 'Prompts' },
  { id: 'shortcuts', label: 'Shortcuts' },
  { id: 'ai-boosts', label: 'AI Boosts' },
  { id: 'memory', label: 'Memory' },
  { id: 'about', label: 'About' },
];

const KEYBOARD_SHORTCUTS = [
  { keys: ['Enter'], description: 'Send message' },
  { keys: ['Shift', 'Enter'], description: 'New line' },
  { keys: ['⌘/Ctrl', 'K'], description: 'Search chats' },
  { keys: ['⌘/Ctrl', 'Shift', 'N'], description: 'New chat' },
  { keys: ['⌘/Ctrl', 'B'], description: 'Toggle sidebar' },
  { keys: ['Escape'], description: 'Close settings / Cancel' },
];

function Switch({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors duration-200 ${
        disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
      } ${checked ? 'bg-[var(--cl-accent)]' : 'bg-[var(--cl-border-2)]'}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

const BOOST_OPTIONS = {
  historyBudget: [
    { value: 12000, label: 'Small (~3k tokens)' },
    { value: 24000, label: 'Normal (~6k tokens)' },
    { value: 48000, label: 'Large (~12k tokens)' },
  ],
  toolOutputLimit: [
    { value: 3000, label: 'Small (3k chars)' },
    { value: 6000, label: 'Normal (6k chars)' },
    { value: 12000, label: 'Large (12k chars)' },
    { value: 0, label: 'No limit' },
  ],
  fileReadLimit: [
    { value: 4000, label: 'Small (4k chars)' },
    { value: 12000, label: 'Normal (12k chars)' },
    { value: 30000, label: 'Large (30k chars)' },
    { value: 0, label: 'No limit' },
  ],
  maxTokens: [
    { value: 1024, label: 'Short (1k)' },
    { value: 2048, label: 'Medium (2k)' },
    { value: 4096, label: 'Long (4k)' },
    { value: 8192, label: 'Very long (8k)' },
  ],
  maxAgents: [2, 3, 4, 5, 6, 8].map((n) => ({ value: n, label: `${n} agents` })),
  agentTokens: [
    { value: 512, label: 'Short (512 tokens)' },
    { value: 1024, label: 'Normal (1k tokens)' },
    { value: 2048, label: 'Long (2k tokens)' },
  ],
  thinking: [
    { value: 'off', label: 'Off' },
    { value: 'light', label: 'Light' },
    { value: 'normal', label: 'Normal' },
    { value: 'deep', label: 'Deep' },
  ],
  upgraderStyle: [
    { value: 'light', label: 'Light (fix wording)' },
    { value: 'balanced', label: 'Balanced' },
    { value: 'detailed', label: 'Detailed (add structure)' },
  ],
  commandApproval: [
    { value: 'ask', label: 'Ask every time' },
    { value: 'safe', label: 'Auto for read-only' },
    { value: 'always', label: 'Always allow' },
  ],
  responseStyle: [
    { value: 'default', label: 'Default' },
    { value: 'concise', label: 'Concise' },
    { value: 'detailed', label: 'Detailed' },
    { value: 'steps', label: 'Step by step' },
  ],
};

function BoostRow({ title, desc, first, children }) {
  return (
    <div className={`flex items-center justify-between gap-4 ${first ? '' : 'border-t border-[var(--cl-border)] pt-4'}`}>
      <div className="min-w-0">
        <p className="text-sm font-medium text-[var(--cl-text)]">{title}</p>
        <p className="text-xs text-[var(--cl-text-3)] mt-0.5">{desc}</p>
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

function BoostSelect({ value, onChange, options, disabled }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const current = options.find((o) => o.value === value) || options[0];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between gap-3 min-w-[160px] bg-[var(--cl-surface)] border border-[var(--cl-border-2)] rounded-lg px-3 py-1.5 text-sm text-[var(--cl-text)] hover:border-[var(--cl-accent)]/50 focus:outline-none focus:border-[var(--cl-accent)]/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <span>{current.label}</span>
        <span className="text-[10px] text-[var(--cl-text-3)]">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 min-w-full bg-[var(--cl-surface)] border border-[var(--cl-border-2)] rounded-lg shadow-xl py-1 max-h-60 overflow-y-auto">
          {options.map((o) => (
            <button
              key={String(o.value)}
              type="button"
              onClick={() => { onChange(o.value); setOpen(false); }}
              className={`w-full text-left px-3 py-1.5 text-sm whitespace-nowrap transition-colors ${
                o.value === value
                  ? 'text-[var(--cl-accent)] bg-[var(--cl-hover)]'
                  : 'text-[var(--cl-text)] hover:bg-[var(--cl-hover)]'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function MemoryPanel({ memory, onSettingsChange, onAdd, onEdit, onDelete, onClear }) {
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    if (!confirmClear) return undefined;
    const t = setTimeout(() => setConfirmClear(false), 4000);
    return () => clearTimeout(t);
  }, [confirmClear]);

  const addDraft = () => {
    if (!draft.trim()) return;
    onAdd(draft);
    setDraft('');
  };

  const finishEdit = (save) => {
    if (save && editingId && editText.trim()) onEdit(editingId, editText);
    setEditingId(null);
  };

  const items = [...memory.items].reverse(); // newest first
  const totalChars = memory.items.reduce((n, m) => n + m.text.length + 3, 0);
  const approxTokens = Math.round(Math.min(totalChars, 2500) / 4);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h3 className="text-lg font-medium text-[var(--cl-text)]">Memory</h3>
        <p className="text-sm text-[var(--cl-text-3)] mt-1">
          Selene remembers things about you, like who you are and what you like, so you don't have to repeat yourself.
        </p>
      </div>

      <div className="bg-[var(--cl-bg)] border border-[var(--cl-border)] rounded-xl p-5 space-y-4">
        <BoostRow first title="Use memory" desc="Selene reads the list below at the start of every chat and uses it to personalise her answers.">
          <Switch checked={memory.enabled} onChange={(v) => onSettingsChange({ enabled: v })} />
        </BoostRow>
        <BoostRow title="Let Selene save memories" desc="When you tell her something lasting about yourself, Selene adds it to the list on her own. She never saves passwords or keys.">
          <Switch checked={memory.autoSave} disabled={!memory.enabled} onChange={(v) => onSettingsChange({ autoSave: v })} />
        </BoostRow>
        <p className="text-xs text-[var(--cl-text-3)] border-t border-[var(--cl-border)] pt-4 leading-relaxed">
          Memories are stored only on this computer. While memory is on, they are sent to your AI provider together with each message
          {approxTokens > 0 ? `, which costs about ${approxTokens} tokens per message.` : '.'}
        </p>
      </div>

      <div className="bg-[var(--cl-bg)] border border-[var(--cl-border)] rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-xs text-[var(--cl-text-3)] font-medium uppercase tracking-wider">What Selene knows about you</p>
          <span className="text-xs text-[var(--cl-text-3)]">{memory.items.length} / 100</span>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={draft}
            maxLength={300}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addDraft(); }}
            placeholder="Add something, e.g. Likes dark, minimal designs"
            className="flex-1 bg-[var(--cl-surface)] border border-[var(--cl-border-2)] rounded-lg px-3 py-2 text-sm text-[var(--cl-text)] placeholder-[var(--cl-text-3)] focus:outline-none focus:border-[var(--cl-accent)]/50 transition-colors"
          />
          <button
            onClick={addDraft}
            disabled={!draft.trim()}
            className="px-4 py-2 text-sm bg-[var(--cl-accent)] hover:bg-[var(--cl-accent-h)] text-white rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
          >
            Add
          </button>
        </div>

        {items.length === 0 ? (
          <p className="text-xs text-[var(--cl-text-3)] text-center py-6 leading-relaxed">
            Nothing yet. Add facts above, or just tell Selene about yourself in a chat.
          </p>
        ) : (
          <div className={`space-y-1 ${memory.enabled ? '' : 'opacity-50'}`}>
            {items.map((item) => (
              <div key={item.id} className="group flex items-start gap-2 rounded-lg px-3 py-2 hover:bg-[var(--cl-hover)] transition-colors">
                {editingId === item.id ? (
                  <input
                    autoFocus
                    value={editText}
                    maxLength={300}
                    onChange={(e) => setEditText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); finishEdit(true); }
                      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finishEdit(false); }
                    }}
                    onBlur={() => finishEdit(true)}
                    className="flex-1 bg-[var(--cl-surface)] border border-[var(--cl-accent)]/50 rounded-lg px-2.5 py-1 text-sm text-[var(--cl-text)] outline-none"
                  />
                ) : (
                  <>
                    <p className="flex-1 min-w-0 text-sm text-[var(--cl-text)] leading-relaxed break-words">{item.text}</p>
                    <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => { setEditingId(item.id); setEditText(item.text); }}
                        title="Edit"
                        className="w-6 h-6 flex items-center justify-center rounded-md text-[var(--cl-text-3)] hover:text-[var(--cl-text)] hover:bg-[var(--cl-border)] transition-colors"
                      >
                        ✎
                      </button>
                      <button
                        onClick={() => onDelete(item.id)}
                        title="Delete"
                        className="w-6 h-6 flex items-center justify-center rounded-md text-[var(--cl-text-3)] hover:text-red-400 hover:bg-red-400/10 transition-colors"
                      >
                        ✕
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {memory.items.length > 0 && (
          <div className="border-t border-[var(--cl-border)] pt-3 flex justify-end">
            <button
              onClick={() => {
                if (confirmClear) { onClear(); setConfirmClear(false); } else { setConfirmClear(true); }
              }}
              className={`px-3 py-1.5 text-xs rounded-lg transition-all ${
                confirmClear
                  ? 'bg-red-500/15 text-red-400 hover:bg-red-500/25'
                  : 'text-[var(--cl-text-3)] hover:text-red-400 hover:bg-red-400/10'
              }`}
            >
              {confirmClear ? 'Click again to delete everything' : 'Clear all memories'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SettingsModal({
  isOpen,
  chatCount,
  apiKeys,
  theme,
  customPrompt,
  searxngUrl,
  promptSystemEnabled,
  promptUpgraderEnabled,
  onTogglePromptSystem,
  onTogglePromptUpgrader,
  boosts,
  onBoostsChange,
  onResetBoosts,
  memory,
  onMemorySettingsChange,
  onAddMemory,
  onEditMemory,
  onDeleteMemory,
  onClearMemory,
  onCustomPromptChange,
  onSearxngUrlChange,
  onSetupSearxng,
  onClose,
  onClearChats,
  onOpenApiModal,
  onThemeChange,
  setupSearxngStatus,
  ollama,
  ollamaUrl,
  activeProvider,
  activeModel,
  onOllamaRefresh,
  onUseOllamaModel,
  local,
  onUseCustomModel,
  ollamaConnected,
  onConnectOllama,
  promptOverrides,
  onPromptChange,
  onPromptReset,
  onPromptsResetAll,
}) {
  const [activeSection, setActiveSection] = useState('general');
  const [localPrompt, setLocalPrompt] = useState(customPrompt);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 md:p-8 animate-fade-in" onClick={onClose}>
      <div
        className="bg-[var(--cl-surface-alt)] border border-[var(--cl-border-2)] w-full max-w-4xl h-[640px] max-h-[90vh] rounded-2xl shadow-2xl flex overflow-hidden animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sidebar */}
        <aside className="w-56 bg-[var(--cl-sidebar)] border-r border-[var(--cl-border)] flex flex-col flex-shrink-0">
          <div className="flex items-center justify-between px-4 h-14 border-b border-[var(--cl-border)] flex-shrink-0">
            <h2 className="text-sm font-semibold text-[var(--cl-text)] tracking-tight">Settings</h2>
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-[var(--cl-text-3)] hover:text-[var(--cl-text)] hover:bg-[var(--cl-hover)] transition-colors"
            >
              ✕
            </button>
          </div>

          <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setActiveSection(item.id);
                  if (item.id === 'ai-boosts') setLocalPrompt(customPrompt);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm rounded-lg transition-colors ${
                  activeSection === item.id
                    ? 'bg-[var(--cl-hover)] text-[var(--cl-text)]'
                    : 'text-[var(--cl-text-2)] hover:bg-[var(--cl-hover)] hover:text-[var(--cl-text)]'
                }`}
              >
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
        </aside>

        {/* Content */}
        <main className="flex-1 overflow-y-auto min-w-0">
          {activeSection === 'general' && (
            <div className="p-6 space-y-6">
              <div>
                <h3 className="text-lg font-medium text-[var(--cl-text)]">General</h3>
                <p className="text-sm text-[var(--cl-text-3)] mt-1">Manage your chats and general preferences.</p>
              </div>
              <div className="bg-[var(--cl-bg)] border border-[var(--cl-border)] rounded-xl p-5 space-y-4">
                <div>
                  <p className="text-sm text-[var(--cl-text)] font-medium">Chats</p>
                  <p className="text-xs text-[var(--cl-text-3)] mt-1">{chatCount} active chat{chatCount !== 1 ? 's' : ''}</p>
                </div>
                <button
                  onClick={() => { if (window.confirm('Are you sure you want to clear all chats?')) { onClearChats(); onClose(); } }}
                  disabled={chatCount === 0}
                  className="bg-[var(--cl-accent)]/10 hover:bg-[var(--cl-accent)]/20 disabled:opacity-30 disabled:cursor-not-allowed text-[var(--cl-accent)] font-medium text-sm py-2.5 px-4 rounded-lg transition-colors"
                >
                  Clear all chats
                </button>
              </div>
            </div>
          )}

          {activeSection === 'appearance' && (
            <div className="p-6 space-y-6">
              <div>
                <h3 className="text-lg font-medium text-[var(--cl-text)]">Appearance</h3>
                <p className="text-sm text-[var(--cl-text-3)] mt-1">Customize the look and feel of the app.</p>
              </div>
              <div className="space-y-3">
                <p className="text-xs text-[var(--cl-text-3)] font-medium uppercase tracking-wider">Theme</p>
                <div className="grid grid-cols-3 gap-3">
                  {THEMES.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => onThemeChange(t.id)}
                      className={`bg-[var(--cl-bg)] rounded-xl p-4 text-left space-y-3 transition-all ${
                        theme === t.id
                          ? 'border-2 border-[var(--cl-accent)]'
                          : 'border-2 border-[var(--cl-border)] hover:border-[var(--cl-accent)]/80'
                      } cursor-pointer`}
                    >
                      <div className={`w-full h-16 rounded-lg flex items-center justify-center ${t.id === 'light' ? 'bg-white' : 'bg-[var(--cl-sidebar)]'}`}>
                        <div className="w-4 h-4 rounded-full" style={{ backgroundColor: t.accent }} />
                      </div>
                      <p className="text-sm font-medium text-[var(--cl-text)]">{t.name}</p>
                      <p className="text-xs text-[var(--cl-text-3)]">{t.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeSection === 'api-config' && (
            <div className="p-6 space-y-6">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-medium text-[var(--cl-text)]">API Configuration</h3>
                  <p className="text-sm text-[var(--cl-text-3)] mt-1">Manage your AI provider API keys and web search.</p>
                </div>
                <button onClick={() => { onOpenApiModal(); onClose(); }} className="bg-[var(--cl-accent)] hover:bg-[var(--cl-accent-h)] text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors">
                  Manage Keys
                </button>
              </div>
              <div className="space-y-3">
                {apiKeys.length === 0 ? (
                  <div className="bg-[var(--cl-bg)] border border-[var(--cl-border)] rounded-xl p-8 text-center">
                    <p className="text-sm text-[var(--cl-text-3)]">No API keys configured</p>
                    <button onClick={() => { onOpenApiModal(); onClose(); }} className="mt-3 text-sm text-[var(--cl-accent)] hover:text-[#d97555] transition-colors font-medium">Add your first API key</button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {(['groq', 'openai', 'ollama']).map((provider) => {
                      const keysForProvider = apiKeys.filter((k) => k.provider === provider);
                      if (keysForProvider.length === 0) return null;
                      return (
                        <div key={provider} className="bg-[var(--cl-bg)] border border-[var(--cl-border)] rounded-xl p-4 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-[var(--cl-hover)] flex items-center justify-center text-sm text-[var(--cl-text-2)]">
                              {provider === 'groq' ? 'G' : provider === 'openai' ? 'O' : 'L'}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-[var(--cl-text)]">{PROVIDER_DISPLAY[provider]}</p>
                              <p className="text-xs text-[var(--cl-text-3)]">{keysForProvider.length} key{keysForProvider.length > 1 ? 's' : ''} configured</p>
                            </div>
                          </div>
                          <span className="text-xs bg-[var(--cl-hover)] text-[var(--cl-text-2)] px-2.5 py-1 rounded-md">
                            {keysForProvider.some((k) => k.id === apiKeys.find((ak) => ak.active)?.id) ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* SearXNG Configuration */}
              <div className="bg-[var(--cl-bg)] border border-[var(--cl-border)] rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-[var(--cl-text)]">
                      SearXNG Search Instance
                      <span className="ml-2 text-xs text-[var(--cl-accent)] bg-[var(--cl-accent)]/10 px-1.5 py-0.5 rounded">Optional</span>
                    </p>
                    <p className="text-xs text-[var(--cl-text-3)] mt-0.5">
                      Selene's desktop app already searches the web on its own, so you can leave this alone. This address is only a fallback for browser mode. 
                      It is free and needs no API keys.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={searxngUrl}
                    onChange={(e) => onSearxngUrlChange(e.target.value)}
                    placeholder="http://localhost:8080"
                    className="flex-1 bg-[var(--cl-surface)] border border-[var(--cl-border-2)] rounded-lg px-3 py-2 text-sm text-[var(--cl-text)] font-mono placeholder-[var(--cl-text-3)] focus:outline-none focus:border-[var(--cl-accent)]/50 transition-colors"
                  />
                  {searxngUrl !== 'http://localhost:8080' && (
                    <button
                      onClick={() => onSearxngUrlChange('http://localhost:8080')}
                      className="px-3 py-2 text-xs text-[var(--cl-text-3)] hover:text-[var(--cl-text)] rounded-lg hover:bg-[var(--cl-hover)] transition-all flex-shrink-0"
                    >
                      Reset
                    </button>
                  )}
                </div>

                <div className="border-t border-[var(--cl-border)] pt-3 space-y-3">
                  <p className="text-xs text-[var(--cl-text-3)] font-medium">Quick Setup</p>
                  <p className="text-xs text-[var(--cl-text-3)] leading-relaxed">
                    Optional, and only for browser mode: installs and starts SearXNG with Docker (requires Docker).
                  </p>
                  <button
                    onClick={onSetupSearxng}
                    disabled={false}
                    className="bg-[var(--cl-accent)]/10 hover:bg-[var(--cl-accent)]/20 text-[var(--cl-accent)] font-medium text-sm py-2 px-4 rounded-lg transition-colors"
                  >
                    🚀 Setup SearXNG Automatically
                  </button>
                  {setupSearxngStatus && (
                    <p className="text-xs text-[var(--cl-text-2)] whitespace-pre-line leading-relaxed">{setupSearxngStatus}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeSection === 'shortcuts' && (
            <div className="p-6 space-y-6">
              <div>
                <h3 className="text-lg font-medium text-[var(--cl-text)]">Keyboard Shortcuts</h3>
                <p className="text-sm text-[var(--cl-text-3)] mt-1">Speed up your workflow with these shortcuts.</p>
              </div>
              <div className="bg-[var(--cl-bg)] border border-[var(--cl-border)] rounded-xl overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[var(--cl-border)]">
                      <th className="text-left text-xs text-[var(--cl-text-3)] font-medium uppercase tracking-wider px-5 py-3">Shortcut</th>
                      <th className="text-left text-xs text-[var(--cl-text-3)] font-medium uppercase tracking-wider px-5 py-3">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {KEYBOARD_SHORTCUTS.map((shortcut, i) => (
                      <tr key={i} className="border-b border-[var(--cl-hover)] last:border-0">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-1.5">
                            {shortcut.keys.map((key, j) => (
                              <span key={j} className="inline-flex items-center px-2 py-1 text-xs font-mono bg-[var(--cl-hover)] border border-[var(--cl-border-2)] rounded-md text-[var(--cl-text)]">{key}</span>
                            ))}
                          </div>
                        </td>
                        <td className="px-5 py-3 text-sm text-[var(--cl-text-2)]">{shortcut.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeSection === 'ai-boosts' && (
            <div className="p-6 space-y-6">
              <div>
                <h3 className="text-lg font-medium text-[var(--cl-text)]">AI Boosts</h3>
                <p className="text-sm text-[var(--cl-text-3)] mt-1">
                  Tune how Selene behaves, how many tokens she uses, and which tools she can call.
                </p>
              </div>

              <div className="bg-[var(--cl-bg)] border border-[var(--cl-border)] rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-[var(--cl-text)]">Prompt System</p>
                    <p className="text-xs text-[var(--cl-text-3)] mt-0.5">Turns on the custom system prompt override below.</p>
                  </div>
                  <Switch checked={promptSystemEnabled} onChange={onTogglePromptSystem} />
                </div>
                <div className="flex items-center justify-between border-t border-[var(--cl-border)] pt-4">
                  <div>
                    <p className="text-sm font-medium text-[var(--cl-text)]">Prompt Upgrader</p>
                    <p className="text-xs text-[var(--cl-text-3)] mt-0.5">Before sending, Selene rewrites your message and asks you to approve it, retry, or use the original.</p>
                  </div>
                  <Switch checked={promptUpgraderEnabled} onChange={onTogglePromptUpgrader} />
                </div>
              </div>

              {/* ── Prompt Upgrader options ── */}
              {promptUpgraderEnabled && (
                <div className="bg-[var(--cl-bg)] border border-[var(--cl-border)] rounded-xl p-5 space-y-4">
                  <p className="text-xs text-[var(--cl-text-3)] font-medium uppercase tracking-wider">Prompt Upgrader options</p>
                  <BoostRow first title="Upgrade style" desc="Light only fixes wording. Balanced makes the message clearer and more specific. Detailed adds structure: goal, context, constraints and output format.">
                    <BoostSelect value={boosts.upgraderStyle} options={BOOST_OPTIONS.upgraderStyle} onChange={(v) => onBoostsChange({ upgraderStyle: v })} />
                  </BoostRow>
                  <BoostRow title="Use chat context" desc="The upgrader also sees your project folder and the last two messages, so the rewrite fits what you are working on. Costs a few extra tokens.">
                    <Switch checked={boosts.upgraderContext} onChange={(v) => onBoostsChange({ upgraderContext: v })} />
                  </BoostRow>
                  <BoostRow title="Skip short messages" desc="Messages like yes, continue or thanks are sent as they are, with no upgrade.">
                    <Switch checked={boosts.upgraderSkipShort} onChange={(v) => onBoostsChange({ upgraderSkipShort: v })} />
                  </BoostRow>
                  <BoostRow title="Send upgraded prompt automatically" desc="No popup: Selene upgrades your message and sends it straight away. If the upgrade fails, your original is sent.">
                    <Switch checked={boosts.upgraderAuto} onChange={(v) => onBoostsChange({ upgraderAuto: v })} />
                  </BoostRow>
                  <p className="text-xs text-[var(--cl-text-3)] border-t border-[var(--cl-border)] pt-4 leading-relaxed">
                    Every upgrade is one extra AI request. In the popup you can edit the result, ask for a shorter or more detailed version, and press Ctrl+Enter to send it.
                  </p>
                </div>
              )}

              {/* ── Token Saver ── */}
              <div className="bg-[var(--cl-bg)] border border-[var(--cl-border)] rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-[var(--cl-text-3)] font-medium uppercase tracking-wider">Token Saver</p>
                  <button
                    onClick={onResetBoosts}
                    className="px-2.5 py-1 text-xs text-[var(--cl-text-3)] hover:text-[var(--cl-text)] rounded-lg hover:bg-[var(--cl-hover)] transition-all"
                  >
                    Reset to defaults
                  </button>
                </div>
                <BoostRow first title="Smart history trimming" desc="Shortens old tool results and drops the oldest messages so each request stays small. Fewer rate-limit errors.">
                  <Switch checked={boosts.tokenSaver} onChange={(v) => onBoostsChange({ tokenSaver: v })} />
                </BoostRow>
                <BoostRow title="History size" desc="How much of the past conversation is sent with every message.">
                  <BoostSelect disabled={!boosts.tokenSaver} value={boosts.historyBudget} options={BOOST_OPTIONS.historyBudget} onChange={(v) => onBoostsChange({ historyBudget: v })} />
                </BoostRow>
                <BoostRow title="Tool output limit" desc="Hard cap on what one tool (a command, a web page) can send back. Stops huge outputs like ls -R from breaking the request.">
                  <BoostSelect value={boosts.toolOutputLimit} options={BOOST_OPTIONS.toolOutputLimit} onChange={(v) => onBoostsChange({ toolOutputLimit: v })} />
                </BoostRow>
                <BoostRow title="File read limit" desc="Max size of a file Selene loads when she reads one from your project.">
                  <BoostSelect value={boosts.fileReadLimit} options={BOOST_OPTIONS.fileReadLimit} onChange={(v) => onBoostsChange({ fileReadLimit: v })} />
                </BoostRow>
                <BoostRow title="Auto-wait on rate limits" desc="If the provider says 'try again in a few seconds', Selene waits and retries instead of showing an error.">
                  <Switch checked={boosts.autoRetry} onChange={(v) => onBoostsChange({ autoRetry: v })} />
                </BoostRow>
              </div>

              {/* ── Response ── */}
              <div className="bg-[var(--cl-bg)] border border-[var(--cl-border)] rounded-xl p-5 space-y-4">
                <p className="text-xs text-[var(--cl-text-3)] font-medium uppercase tracking-wider">Response</p>
                <BoostRow first title="Response length" desc="Maximum length of each reply. Shorter replies use fewer tokens.">
                  <BoostSelect value={boosts.maxTokens} options={BOOST_OPTIONS.maxTokens} onChange={(v) => onBoostsChange({ maxTokens: v })} />
                </BoostRow>
                <BoostRow title="Creativity" desc="Low is focused and precise (good for code). High is more varied and creative.">
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min="0"
                      max="1.5"
                      step="0.1"
                      value={boosts.temperature}
                      onChange={(e) => onBoostsChange({ temperature: Number(e.target.value) })}
                      className="w-32 accent-[var(--cl-accent)]"
                    />
                    <span className="text-xs font-mono text-[var(--cl-text-2)] w-8 text-right">{Number(boosts.temperature).toFixed(1)}</span>
                  </div>
                </BoostRow>
                <BoostRow title="Response style" desc="Adds a short instruction to Selene's system prompt.">
                  <BoostSelect value={boosts.responseStyle} options={BOOST_OPTIONS.responseStyle} onChange={(v) => onBoostsChange({ responseStyle: v })} />
                </BoostRow>
                <BoostRow title="Thinking" desc="Selene works the problem out first and shows her reasoning in a collapsible block, then answers. Better for hard questions and code, but slower and uses more tokens. Also switchable next to the message box.">
                  <BoostSelect value={boosts.thinking} options={BOOST_OPTIONS.thinking} onChange={(v) => onBoostsChange({ thinking: v })} />
                </BoostRow>
              </div>

              {/* ── Tools ── */}
              <div className="bg-[var(--cl-bg)] border border-[var(--cl-border)] rounded-xl p-5 space-y-4">
                <div>
                  <p className="text-xs text-[var(--cl-text-3)] font-medium uppercase tracking-wider">Tools</p>
                  <p className="text-xs text-[var(--cl-text-3)] mt-1">Each enabled tool adds a few hundred tokens to every request, so turn off what you don't need.</p>
                </div>
                <BoostRow first title="Web search" desc="Lets Selene look things up on the internet.">
                  <Switch checked={boosts.toolWebSearch} onChange={(v) => onBoostsChange({ toolWebSearch: v })} />
                </BoostRow>
                <BoostRow title="Read web pages" desc="Lets Selene open a link and read the page.">
                  <Switch checked={boosts.toolReadUrl} onChange={(v) => onBoostsChange({ toolReadUrl: v })} />
                </BoostRow>
                <BoostRow title="Terminal commands" desc="Lets Selene ask to run commands on your computer.">
                  <Switch checked={boosts.toolRunCommand} onChange={(v) => onBoostsChange({ toolRunCommand: v })} />
                </BoostRow>
                <BoostRow title="Command approval" desc="Ask every time: you approve each command. Auto for read-only: she can look at files (ls, cat, grep, git status...) inside your project folder without asking, anything else still asks. Always allow: she can run anything without asking, including deleting files.">
                  <BoostSelect disabled={!boosts.toolRunCommand} value={boosts.commandApproval} options={BOOST_OPTIONS.commandApproval} onChange={(v) => onBoostsChange({ commandApproval: v })} />
                </BoostRow>
                <BoostRow title="To-do list" desc="Lets Selene make a checklist for bigger tasks and show it in a panel on the right. You can tick items yourself.">
                  <Switch checked={boosts.toolTodos} onChange={(v) => onBoostsChange({ toolTodos: v })} />
                </BoostRow>
                <BoostRow title="Tool list" desc="Lets Selene check which tools she has when she is unsure what she can do. You can also type /tools in the chat.">
                  <Switch checked={boosts.toolListTools !== false} onChange={(v) => onBoostsChange({ toolListTools: v })} />
                </BoostRow>
              </div>

              {/* ── Helper agents ── */}
              <div className="bg-[var(--cl-bg)] border border-[var(--cl-border)] rounded-xl p-5 space-y-4">
                <div>
                  <p className="text-xs text-[var(--cl-text-3)] font-medium uppercase tracking-wider">Helper agents</p>
                  <p className="text-xs text-[var(--cl-text-3)] mt-1">Selene can split a big job between several agents that work at the same time, then combine what they found into one answer.</p>
                </div>
                <BoostRow first title="Allow helper agents" desc="Selene decides when a job is worth splitting up and how many agents to use. Small questions are still answered directly.">
                  <Switch checked={boosts.agentsEnabled} onChange={(v) => onBoostsChange({ agentsEnabled: v })} />
                </BoostRow>
                <BoostRow title="Maximum agents" desc="The most agents Selene may start at once. She picks how many she needs, up to this number.">
                  <BoostSelect disabled={!boosts.agentsEnabled} value={boosts.maxAgents} options={BOOST_OPTIONS.maxAgents} onChange={(v) => onBoostsChange({ maxAgents: v })} />
                </BoostRow>
                <BoostRow title="Agent report length" desc="How long each agent's report can be. Shorter reports use fewer tokens.">
                  <BoostSelect disabled={!boosts.agentsEnabled} value={boosts.agentTokens} options={BOOST_OPTIONS.agentTokens} onChange={(v) => onBoostsChange({ agentTokens: v })} />
                </BoostRow>
                <p className="text-xs text-[var(--cl-text-3)] border-t border-[var(--cl-border)] pt-4 leading-relaxed">
                  Every agent is a separate AI request, so 3 agents use roughly 3 times the tokens. On a free plan, keep the maximum low.
                  Agents can search the web and read pages (when those tools are on above), but they never run commands or change files.
                </p>
              </div>

              {promptSystemEnabled && (
              <div className="bg-[var(--cl-bg)] border border-[var(--cl-border)] rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-[var(--cl-text)]">System Prompt Override</p>
                  {localPrompt !== customPrompt && (
                    <span className="text-xs text-[var(--cl-accent)] bg-[var(--cl-accent)]/10 px-2 py-0.5 rounded-md font-medium">Unsaved changes</span>
                  )}
                </div>
                <textarea
                  value={localPrompt}
                  onChange={(e) => setLocalPrompt(e.target.value)}
                  placeholder={`Example:\nYou are an expert TypeScript developer. Prefer functional patterns over classes. Always include JSDoc comments.`}
                  className="w-full bg-[var(--cl-surface)] border border-[var(--cl-border-2)] rounded-lg p-4 text-sm text-[var(--cl-text)] font-mono leading-relaxed resize-y min-h-[180px] focus:outline-none focus:border-[var(--cl-accent)]/50 placeholder-[var(--cl-text-3)] transition-colors"
                  rows={8}
                />
                <div className="flex items-center justify-between">
                  <p className="text-xs text-[var(--cl-text-3)]">
                    {localPrompt.length > 0 ? `${localPrompt.length} characters` : 'No custom prompt set'}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setLocalPrompt(customPrompt); // revert
                      }}
                      disabled={localPrompt === customPrompt}
                      className="px-3 py-1.5 text-xs text-[var(--cl-text-3)] hover:text-[var(--cl-text)] rounded-lg hover:bg-[var(--cl-hover)] transition-all disabled:opacity-30"
                    >
                      Reset
                    </button>
                    <button
                      onClick={() => {
                        onCustomPromptChange(localPrompt);
                      }}
                      disabled={localPrompt === customPrompt}
                      className="px-4 py-1.5 text-xs bg-[var(--cl-accent)] hover:bg-[var(--cl-accent-h)] text-white rounded-lg transition-all disabled:opacity-50"
                    >
                      Save
                    </button>
                  </div>
                </div>
                <div className="border-t border-[var(--cl-border)] pt-4 mt-2">
                  <p className="text-xs text-[var(--cl-text-3)] font-medium mb-2">💡 Tips</p>
                  <ul className="text-xs text-[var(--cl-text-3)] space-y-1.5 list-disc list-inside">
                    <li>Instructions apply to <strong>all chats</strong></li>
                    <li>Selene sees this before every response she generates</li>
                    <li>Use it to set coding style, tone, or project-specific rules</li>
                    <li>Changes take effect on the <strong>next message you send</strong></li>
                  </ul>
                </div>
              </div>
              )}
            </div>
          )}

          {activeSection === 'local-models' && (
            <LocalModelsTab
              local={local}
              activeProvider={activeProvider}
              activeModel={activeModel}
              onUseCustomModel={onUseCustomModel}
              ollama={ollama}
              ollamaUrl={ollamaUrl}
              ollamaConnected={ollamaConnected}
              onOllamaRefresh={onOllamaRefresh}
              onUseOllamaModel={onUseOllamaModel}
              onConnectOllama={onConnectOllama}
            />
          )}

          {activeSection === 'prompts' && (
            <PromptsPanel
              promptOverrides={promptOverrides || {}}
              onChange={onPromptChange}
              onReset={onPromptReset}
              onResetAll={onPromptsResetAll}
            />
          )}

          {activeSection === 'memory' && (
            <MemoryPanel
              memory={memory}
              onSettingsChange={onMemorySettingsChange}
              onAdd={onAddMemory}
              onEdit={onEditMemory}
              onDelete={onDeleteMemory}
              onClear={onClearMemory}
            />
          )}

          {activeSection === 'about' && (
            <div className="p-6 space-y-6">
              <div>
                <h3 className="text-lg font-medium text-[var(--cl-text)]">About</h3>
                <p className="text-sm text-[var(--cl-text-3)] mt-1">Version information and credits.</p>
              </div>
              <div className="bg-[var(--cl-bg)] border border-[var(--cl-border)] rounded-xl p-5 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[var(--cl-accent)]/20 flex items-center justify-center text-sm font-semibold text-[var(--cl-accent)]">S</div>
                  <div>
                    <p className="text-sm font-medium text-[var(--cl-text)]">Selene AI Chat</p>
                    <p className="text-xs text-[var(--cl-text-3)]">Version 1.0</p>
                  </div>
                </div>
                <p className="text-xs text-[var(--cl-text-3)] leading-relaxed">
                  A multi-provider AI chat interface powered by Groq, OpenAI, and Ollama.
                  Built with React, JavaScript, and Tailwind CSS.
                </p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
