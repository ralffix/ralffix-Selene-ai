import { useState } from 'react';
import CustomModelsPanel from './CustomModelsPanel';
import ModelBrowser from './ModelBrowser';
import OllamaPanel from './OllamaPanel';

// Settings, Local models: your own .gguf files, a browser to find and install more, and Ollama as an optional extra
export default function LocalModelsTab({
  local,
  activeProvider,
  activeModel,
  onUseCustomModel,
  ollama,
  ollamaUrl,
  ollamaConnected,
  onOllamaRefresh,
  onUseOllamaModel,
  onConnectOllama,
}) {
  const [view, setView] = useState('mine'); // 'mine' | 'find'
  const [showOllama, setShowOllama] = useState(false);

  const active = Object.values(local.downloads || {}).filter((d) => d.status === 'downloading');

  return (
    <div>
      <div className="px-6 pt-5 flex items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-[var(--cl-border-2)] overflow-hidden">
          {[{ id: 'mine', label: 'My models' }, { id: 'find', label: 'Find & install' }].map((t) => (
            <button
              key={t.id}
              onClick={() => setView(t.id)}
              className={`px-3.5 py-1.5 text-xs transition-colors ${
                view === t.id
                  ? 'bg-[var(--cl-accent)]/15 text-[var(--cl-accent)]'
                  : 'text-[var(--cl-text-3)] hover:text-[var(--cl-text)] hover:bg-[var(--cl-hover)]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {active.length > 0 && (
          <span className="text-xs text-[var(--cl-text-3)] truncate">
            Downloading {active.length === 1 ? active[0].name : `${active.length} models`}
            {active.length === 1 && active[0].total ? ` · ${Math.min(100, Math.round((active[0].done / active[0].total) * 100))}%` : ''}
          </span>
        )}
      </div>

      {view === 'find' ? (
        <ModelBrowser local={local} onUseModel={onUseCustomModel} />
      ) : (
        <>
          <CustomModelsPanel
            local={local}
            activeProvider={activeProvider}
            activeModel={activeModel}
            onUseModel={onUseCustomModel}
          />

          <div className="px-6 pb-6">
            <button
              onClick={() => setShowOllama((v) => !v)}
              className="text-xs text-[var(--cl-text-3)] hover:text-[var(--cl-text)] transition-colors"
            >
              {showOllama ? '▾' : '▸'} Also use Ollama (optional)
            </button>
          </div>

          {showOllama && (
            <div className="border-t border-[var(--cl-border)]">
              <OllamaPanel
                ollama={ollama}
                baseUrl={ollamaUrl}
                activeProvider={activeProvider}
                activeModel={activeModel}
                onRefresh={onOllamaRefresh}
                onUseModel={onUseOllamaModel}
                connected={ollamaConnected}
                onConnect={onConnectOllama}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
