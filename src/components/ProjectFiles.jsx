import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { FolderIcon } from './icons';

function FileTreeNode({ name, filePath, isDir, depth, onFileClick }) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadChildren = useCallback(async () => {
    if (children !== null) return;
    setLoading(true);
    try {
      const entries = await invoke('list_project_dir', { path: filePath });
      setChildren(entries);
    } catch {
      setChildren([]);
    } finally {
      setLoading(false);
    }
  }, [filePath, children]);

  const handleToggle = () => {
    if (!expanded) loadChildren();
    setExpanded(!expanded);
  };

  if (isDir) {
    return (
      <div>
        <button
          onClick={handleToggle}
          className="w-full flex items-center gap-1.5 px-2 py-1 text-xs rounded-md hover:bg-[var(--cl-hover)] text-[var(--cl-text-2)] hover:text-[var(--cl-text)] transition-all text-left"
          style={{ paddingLeft: `${8 + depth * 12}px` }}
        >
          <svg
            className={`w-3 h-3 flex-shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`}
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
          >
            <path d="M9 18l6-6-6-6" />
          </svg>
          <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
          </svg>
          <span className="truncate">{name}/</span>
        </button>
        {expanded && (
          <div>
            {loading && (
              <p className="text-xs text-[var(--cl-text-3)] px-2 py-1 animate-breathe" style={{ paddingLeft: `${20 + depth * 12}px` }}>
                Loading...
              </p>
            )}
            {!loading && children && children.length === 0 && (
              <p className="text-xs text-[var(--cl-text-3)] px-2 py-1" style={{ paddingLeft: `${20 + depth * 12}px` }}>
                empty
              </p>
            )}
            {!loading && children && children.length > 0 && children.map((child) => (
              <FileTreeNode
                key={child.path}
                name={child.name}
                filePath={child.path}
                isDir={child.is_dir}
                depth={depth + 1}
                onFileClick={onFileClick}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={() => onFileClick?.(filePath)}
      className="w-full flex items-center gap-1.5 px-2 py-1 text-xs rounded-md hover:bg-[var(--cl-hover)] text-[var(--cl-text-2)] hover:text-[var(--cl-text)] transition-all text-left"
      style={{ paddingLeft: `${20 + depth * 12}px` }}
    >
      <svg className="w-3.5 h-3.5 flex-shrink-0 text-[var(--cl-text-3)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z" />
        <polyline points="13 2 13 9 20 9" />
      </svg>
      <span className="truncate">{name}</span>
    </button>
  );
}

export default function ProjectFiles({ folderPath, onFolderChange }) {
  const [rootFiles, setRootFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadRoot = useCallback(async (path) => {
    if (!path) return;
    setLoading(true);
    setError(null);
    try {
      const entries = await invoke('list_project_dir', { path });
      setRootFiles(entries);
    } catch (err) {
      setError(String(err));
      setRootFiles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (folderPath) loadRoot(folderPath);
  }, [folderPath, loadRoot]);

  const handlePickFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select Project Folder',
      });
      if (selected) {
        onFolderChange(selected);
      }
    } catch (err) {
      setError(String(err));
    }
  };

  const handleUnlink = () => {
    onFolderChange(null);
    setRootFiles([]);
  };

  const handleFileClick = async (filePath) => {
    // Future: open file preview
  };

  if (!folderPath) {
    return (
      <div className="px-3 pt-4">
        <p className="px-3 pb-2 text-xs text-[var(--cl-text-3)] font-semibold uppercase tracking-wider">
          Project Folder
        </p>
        <button
          onClick={handlePickFolder}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-[var(--cl-text-2)] rounded-lg border border-dashed border-[var(--cl-border-2)] hover:border-[var(--cl-accent)]/50 hover:text-[var(--cl-text)] hover:bg-[var(--cl-hover)] transition-all duration-200"
        >
          <FolderIcon className="w-4 h-4 text-[var(--cl-accent)]" />
          <span>Link a folder...</span>
        </button>
        <p className="px-3 pt-1.5 text-[10px] text-[var(--cl-text-3)] leading-relaxed">
          Link a project folder so Selene can read your code and write changes directly.
        </p>
      </div>
    );
  }

  const folderName = folderPath.split('/').pop() || folderPath.split('\\').pop();

  return (
    <div className="px-3 pt-4">
      <div className="flex items-center justify-between px-3 pb-2">
        <p className="text-xs text-[var(--cl-text-3)] font-semibold uppercase tracking-wider">
          Project Folder
        </p>
        <button
          onClick={handleUnlink}
          className="text-[10px] text-[var(--cl-text-3)] hover:text-red-400 transition-colors px-1.5 py-0.5 rounded hover:bg-red-400/10"
        >
          Unlink
        </button>
      </div>
      <div className="px-3 pb-2 flex items-center gap-2">
        <FolderIcon className="w-3.5 h-3.5 text-[var(--cl-accent)] flex-shrink-0" />
        <span className="text-xs text-[var(--cl-text-2)] truncate">{folderName}</span>
      </div>

      {loading && (
        <p className="px-3 py-2 text-xs text-[var(--cl-text-3)] animate-breathe">Loading files...</p>
      )}
      {error && (
        <p className="px-3 py-2 text-xs text-red-400">{error}</p>
      )}
      {!loading && !error && rootFiles.length > 0 && (
        <div className="max-h-[300px] overflow-y-auto px-1 py-1 rounded-lg bg-[var(--cl-surface-alt)]/50">
          {rootFiles.map((file) => (
            <FileTreeNode
              key={file.path}
              name={file.name}
              filePath={file.path}
              isDir={file.is_dir}
              depth={0}
              onFileClick={handleFileClick}
            />
          ))}
        </div>
      )}
      {!loading && !error && rootFiles.length === 0 && (
        <div className="px-3 py-2">
          <button
            onClick={handlePickFolder}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[var(--cl-text-3)] rounded-lg border border-dashed border-[var(--cl-border-2)] hover:border-[var(--cl-accent)]/40 hover:text-[var(--cl-text-2)] transition-all"
          >
            <FolderIcon className="w-3.5 h-3.5" />
            <span>Reload folder</span>
          </button>
        </div>
      )}
    </div>
  );
}
