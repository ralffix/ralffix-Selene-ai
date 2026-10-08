import { useState, useRef, useEffect } from 'react';
import { PROVIDER_DISPLAY, PROVIDER_MODELS } from '../types';
import { useCloudModels } from '../cloudmodels';
import { ChevronDownIcon } from './icons';

export default function ModelDropdown({
  apiKeys,
  activeKeyId,
  activeModel,
  onSelectKey,
  onSelectModel,
  onManageKeys,
  providerLabel,
  ollama,
  customModels,
}) {
  const [open, setOpen] = useState(false);
  const [expandedProvider, setExpandedProvider] = useState(null);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const activeKey = apiKeys.find((k) => k.id === activeKeyId);

  // Groq and OpenAI lists come from the providers themselves (built-in list if offline)
  const cloud = useCloudModels(apiKeys);
  const cloudList = (provider) => {
    const list = cloud[provider] || PROVIDER_MODELS[provider] || [];
    return activeKey?.provider === provider && activeModel && !list.includes(activeModel) ? [activeModel, ...list] : list;
  };

  // Group keys by provider
  const groupedByProvider = apiKeys.reduce((acc, key) => {
    if (!acc[key.provider]) acc[key.provider] = [];
    acc[key.provider].push(key);
    return acc;
  }, {});

  const handleSelectKeyAndModel = (keyId, provider, model) => {
    if (keyId !== activeKeyId) {
      onSelectKey(keyId);
    }
    onSelectModel(model);
    setOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-[var(--cl-text-2)] hover:text-[var(--cl-text)] rounded-lg hover:bg-[var(--cl-hover)] transition-colors"
      >
        <span>{providerLabel}</span>
        <ChevronDownIcon className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-64 bg-[var(--cl-bg)] border border-[var(--cl-border-2)] rounded-xl shadow-2xl shadow-black/50 py-2 z-50 max-h-80 overflow-y-auto">
          {apiKeys.length === 0 ? (
            <div className="px-4 py-6 text-center space-y-3">
              <p className="text-sm text-[var(--cl-text-3)]">No API keys configured</p>
              <button
                onClick={() => {
                  setOpen(false);
                  onManageKeys();
                }}
                className="text-sm text-[var(--cl-accent)] hover:text-[#d97555] transition-colors font-medium"
              >
                Add API key
              </button>
            </div>
          ) : (
            <div>
              {Object.entries(groupedByProvider).map(([provider, keys]) => {
                const isExpanded = expandedProvider === provider;
                const providerModels = provider === 'ollama'
                  ? (ollama?.models || []).map((m) => m.name)
                  : provider === 'custom'
                    ? (customModels || []).map((m) => m.name)
                    : cloudList(provider);
                const isActiveProvider = activeKey?.provider === provider;

                return (
                  <div key={provider}>
                    <button
                      onClick={() => setExpandedProvider(isExpanded ? null : provider)}
                      className={`w-full flex items-center justify-between px-4 py-2.5 text-sm transition-colors ${
                        isActiveProvider
                          ? 'text-[var(--cl-text)] bg-[var(--cl-hover)]'
                          : 'text-[var(--cl-text-2)] hover:text-[var(--cl-text)] hover:bg-[var(--cl-hover)]'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span>{PROVIDER_DISPLAY[provider]}</span>
                        <span className="text-xs text-[var(--cl-text-3)]">
                          {keys.length > 1 ? `${keys.length} keys` : keys[0].name}
                        </span>
                      </div>
                      <svg
                        className={`w-3.5 h-3.5 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>

                    {isExpanded && (
                      <div className="pb-1">
                        {provider === 'ollama' && providerModels.length === 0 && (
                          <p className="px-6 py-2 text-xs text-[var(--cl-text-3)] leading-relaxed">
                            {ollama?.online
                              ? 'No models installed yet. Open Settings, Local models to download one.'
                              : 'Ollama is not running. Open Settings, Local models to start it.'}
                          </p>
                        )}
                        {provider === 'custom' && providerModels.length === 0 && (
                          <p className="px-6 py-2 text-xs text-[var(--cl-text-3)] leading-relaxed">
                            No models yet. Open Settings, Local models to add a .gguf file.
                          </p>
                        )}
                        {providerModels.map((model) => {
                          const isSelected = isActiveProvider && activeModel === model;
                          return (
                            <button
                              key={model}
                              onClick={() => handleSelectKeyAndModel(keys[0].id, provider, model)}
                              className={`w-full flex items-center gap-3 px-6 py-2 text-sm transition-colors ${
                                isSelected
                                  ? 'text-[var(--cl-text)] bg-[var(--cl-surface)]'
                                  : 'text-[var(--cl-text-2)] hover:text-[var(--cl-text)] hover:bg-[var(--cl-hover)]'
                              }`}
                            >
                              <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                                isSelected
                                  ? 'border-[var(--cl-accent)] bg-[var(--cl-accent)]'
                                  : 'border-[var(--cl-border-3)]'
                              }`}>
                                {isSelected && (
                                  <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                  </svg>
                                )}
                              </span>
                              <span className="font-mono text-xs">{model}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}

              <div className="border-t border-[var(--cl-border)] mt-1 pt-1">
                <button
                  onClick={() => {
                    setOpen(false);
                    onManageKeys();
                  }}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-[var(--cl-text-2)] hover:text-[var(--cl-text)] hover:bg-[var(--cl-hover)] transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.75 5.25a3 3 0 013 3m-6 6l2.5-2.5m-10.5 8.5l2.5-2.5m5.5-5.5l6-6" />
                  </svg>
                  <span>Manage API Keys</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
