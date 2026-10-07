import { useState, useEffect } from 'react';
import { PROVIDER_DISPLAY, detectProviderFromKey } from '../types';

function maskKey(key) {
  if (key.length <= 12) return key;
  return `${key.slice(0, 11)}...${key.slice(-4)}`;
}

export default function ApiModal({
  isOpen,
  keys,
  activeKeyId,
  onClose,
  onAddKey,
  onSelectKey,
}) {
  const [name, setName] = useState('');
  const [provider, setProvider] = useState('groq');
  const [keyValue, setKeyValue] = useState('');

  // Auto-detect provider from key
  useEffect(() => {
    if (keyValue.trim()) {
      const detected = detectProviderFromKey(keyValue.trim());
      if (detected) {
        setProvider(detected);
        // Auto-fill a default name based on provider
        if (!name.trim() || name === PROVIDER_DISPLAY[provider]) {
          setName(PROVIDER_DISPLAY[detected]);
        }
      }
    }
  }, [keyValue]);

  // Update name when provider changes manually
  useEffect(() => {
    if (!name.trim()) {
      setName(PROVIDER_DISPLAY[provider]);
    }
  }, []);

  if (!isOpen) return null;

  const handleSave = () => {
    if (!name.trim() || !keyValue.trim()) return;
    onAddKey({ name: name.trim(), provider, key: keyValue.trim() });
    setName('');
    setKeyValue('');
    setProvider('groq');
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div
        className="bg-[var(--cl-bg)] border border-[var(--cl-border-2)] w-full max-w-md rounded-2xl shadow-2xl p-6 space-y-4 animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center pb-3 border-b border-[var(--cl-border)]">
          <h3 className="text-base font-medium text-[var(--cl-text)]">API Keys</h3>
          <button onClick={onClose} className="text-[var(--cl-text-3)] hover:text-[var(--cl-text)] transition-colors">
            ✕
          </button>
        </div>

        <div className="space-y-2 max-h-48 overflow-y-auto">
          {keys.length === 0 ? (
            <p className="text-sm text-[var(--cl-text-3)] text-center py-4">No keys configured yet</p>
          ) : (
            keys.map((entry) => (
              <div
                key={entry.id}
                className={`flex items-center justify-between p-3 rounded-xl transition-colors ${
                  entry.id === activeKeyId
                    ? 'bg-[var(--cl-surface)] border border-[var(--cl-accent)]/40'
                    : 'bg-[var(--cl-hover)] border border-transparent hover:border-[var(--cl-border-2)] cursor-pointer'
                }`}
                onClick={entry.id !== activeKeyId ? () => onSelectKey(entry.id) : undefined}
              >
                <div>
                  <p className="text-sm font-medium text-[var(--cl-text)]">{entry.name}</p>
                  <p className="text-xs text-[var(--cl-text-3)]">
                    {entry.provider === 'ollama' ? entry.key : maskKey(entry.key)}
                  </p>
                </div>
                {entry.id === activeKeyId ? (
                  <span className="text-xs bg-[var(--cl-accent)]/20 text-[var(--cl-accent)] px-2 py-0.5 rounded-md">
                    Active
                  </span>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectKey(entry.id);
                    }}
                    className="text-xs text-[var(--cl-text-2)] hover:text-[var(--cl-text)]"
                  >
                    Select
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        <div className="border-t border-[var(--cl-border)] pt-4 space-y-3">
          <p className="text-xs font-medium text-[var(--cl-text-3)] uppercase tracking-wider">Add provider</p>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name"
              className="bg-[var(--cl-surface)] border border-[var(--cl-border-2)] rounded-lg p-2.5 text-sm text-[var(--cl-text)] focus:outline-none focus:border-[var(--cl-border-3)] placeholder-[var(--cl-text-3)]"
            />
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="bg-[var(--cl-surface)] border border-[var(--cl-border-2)] rounded-lg p-2.5 text-sm text-[var(--cl-text)] focus:outline-none focus:border-[var(--cl-border-3)]"
            >
              <option value="groq">Groq</option>
              <option value="openai">OpenAI</option>
              <option value="ollama">Ollama</option>
            </select>
          </div>            <input
              type="password"
              value={keyValue}
              onChange={(e) => setKeyValue(e.target.value)}
              placeholder="Paste API key or endpoint URL..."
              className="w-full bg-[var(--cl-surface)] border border-[var(--cl-border-2)] rounded-lg p-2.5 text-sm text-[var(--cl-text)] focus:outline-none focus:border-[var(--cl-border-3)] placeholder-[var(--cl-text-3)]"
            />
            {keyValue.trim() && detectProviderFromKey(keyValue.trim()) && (
              <p className="text-xs text-[var(--cl-text-3)] px-1">
                Detected: {PROVIDER_DISPLAY[detectProviderFromKey(keyValue.trim())]}
              </p>
            )}
          <button
            onClick={handleSave}
            disabled={!name.trim() || !keyValue.trim()}
            className="w-full bg-[var(--cl-accent)] hover:bg-[var(--cl-accent-h)] disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-sm py-2.5 rounded-lg transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
