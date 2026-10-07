import { SidebarIcon, DownloadIcon } from './icons';
import ModelDropdown from './ModelDropdown';

export default function Header({
  providerLabel,
  sidebarCollapsed,
  onToggleSidebar,
  onManageKeys,
  apiKeys,
  activeKeyId,
  activeModel,
  onSelectKey,
  onSelectModel,
  isRotating,
  onExportChat,
  ollama,
  customModels,
}) {
  return (
    <header className="h-12 flex items-center justify-between px-4 flex-shrink-0 border-b border-[var(--cl-border)]">
      <button
        onClick={onToggleSidebar}
        className="p-2 rounded-lg text-[var(--cl-text-2)] hover:bg-[var(--cl-hover)] hover:text-[var(--cl-text)] transition-colors"
        title={sidebarCollapsed ? 'Open sidebar' : 'Close sidebar'}
      >
        <SidebarIcon />
      </button>

      <div className="flex items-center gap-3">
        {isRotating && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 animate-pulse">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-xs font-medium text-amber-400 whitespace-nowrap">Rotating keys...</span>
          </div>
        )}

        {onExportChat && (
          <button
            onClick={onExportChat}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[var(--cl-text-3)] hover:text-[var(--cl-text)] hover:bg-[var(--cl-hover)] border border-transparent hover:border-[var(--cl-border-2)] transition-all text-xs"
            title="Export chat as markdown"
          >
            <DownloadIcon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Export</span>
          </button>
        )}

        <ModelDropdown
          apiKeys={apiKeys}
          activeKeyId={activeKeyId}
          activeModel={activeModel}
          onSelectKey={onSelectKey}
          onSelectModel={onSelectModel}
          onManageKeys={onManageKeys}
          providerLabel={providerLabel}
          ollama={ollama}
          customModels={customModels}
        />
      </div>

      <div className="w-9" />
    </header>
  );
}
