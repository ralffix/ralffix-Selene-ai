import { useState, useCallback, useRef, useEffect, memo } from 'react';
import hljs from 'highlight.js';
import {
  MoonIcon, CopyIcon, EditIcon, TrashIcon, CheckIcon, RefreshIcon,
  TerminalIcon, GlobeIcon, FileTextIcon, ChevronDownIcon, ChevronRightIcon,
  FunctionIcon
} from './icons';
import { splitThinking } from '../thinking';

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const hours = d.getHours().toString().padStart(2, '0');
  const mins = d.getMinutes().toString().padStart(2, '0');
  const time = `${hours}:${mins}`;
  if (isToday) return time;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday ${time}`;
  return `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')} ${time}`;
}

function CodeBlock({ code, lang }) {
  const [copied, setCopied] = useState(false);
  const codeRef = useRef(null);

  useEffect(() => {
    if (codeRef.current && lang && hljs.getLanguage(lang)) {
      hljs.highlightElement(codeRef.current);
    } else if (codeRef.current) {
      hljs.highlightElement(codeRef.current);
    }
  }, [code, lang]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [code]);

  return (
    <div className="code-block animate-fade-in group">
      <div className="code-block-header">
        <span>{lang || 'code'}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-md hover:bg-[var(--cl-surface)] transition-all duration-200"
        >
          {copied ? (
            <>
              <CheckIcon className="w-3.5 h-3.5" />
              <span>Copied!</span>
            </>
          ) : (
            <>
              <CopyIcon className="w-3.5 h-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="code-block-content">
        <code ref={codeRef} className={lang ? `language-${lang}` : ''}>
          {code}
        </code>
      </pre>
    </div>
  );
}

function renderMarkdown(content) {
  if (!content) return [];

  const lines = content.split('\n');
  const elements = [];
  let inCodeBlock = false;
  let codeBlockContent = [];
  let codeBlockLang = '';
  let codeBlockIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.trimStart().startsWith('```')) {
      if (inCodeBlock) {
        const idx = codeBlockIndex++;
        elements.push(
          <CodeBlock
            key={`cb-${idx}`}
            code={codeBlockContent.join('\n')}
            lang={codeBlockLang}
            index={idx}
          />
        );
        codeBlockContent = [];
        codeBlockLang = '';
        inCodeBlock = false;
      } else {
        codeBlockLang = line.trim().slice(3).trim();
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockContent.push(line);
      continue;
    }

    if (line.trim() === '') {
      elements.push(<div key={`sp-${i}`} className="h-3" />);
      continue;
    }

    if (line.startsWith('### ')) {
      elements.push(
        <h3 key={`h3-${i}`} className="text-base font-semibold mt-4 mb-2 text-[var(--cl-text)]">
          {renderInline(line.slice(4))}
        </h3>
      );
      continue;
    }
    if (line.startsWith('## ')) {
      elements.push(
        <h2 key={`h2-${i}`} className="text-lg font-semibold mt-5 mb-2 text-[var(--cl-text)]">
          {renderInline(line.slice(3))}
        </h2>
      );
      continue;
    }
    if (line.startsWith('# ')) {
      elements.push(
        <h1 key={`h1-${i}`} className="text-xl font-semibold mt-5 mb-3 text-[var(--cl-text)]">
          {renderInline(line.slice(2))}
        </h1>
      );
      continue;
    }

    if (line.trimStart().startsWith('|') && line.trimEnd().endsWith('|')) {
      if (/^\|[\s:\-|]+\|$/.test(line.trim())) {
        continue;
      }
      const tableRows = [line];
      let j = i + 1;
      while (j < lines.length && lines[j].trimStart().startsWith('|') && lines[j].trimEnd().endsWith('|')) {
        tableRows.push(lines[j]);
        j++;
      }
      i = j - 1;

      if (tableRows.length >= 2) {
        const headers = tableRows[0].split('|').filter(c => c.trim()).map(c => c.trim());
        const dataRows = tableRows.slice(2);
        const cells = dataRows.map(row =>
          row.split('|').filter(c => c.trim()).map(c => c.trim())
        );
        elements.push(
          <div key={`table-${i}`} className="my-3 overflow-x-auto">
            <table className="w-full border-collapse text-sm text-[var(--cl-text)]">
              <thead>
                <tr>
                  {headers.map((h, hi) => (
                    <th key={hi} className="border border-[var(--cl-border-2)] bg-[var(--cl-hover)] px-3 py-2 text-left font-medium text-[var(--cl-text)] first:rounded-tl-lg last:rounded-tr-lg">
                      {renderInline(h)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cells.map((row, ri) => (
                  <tr key={ri} className="even:bg-[var(--cl-surface)]">
                    {row.map((cell, ci) => (
                      <td key={ci} className="border border-[var(--cl-border-2)] px-3 py-2 text-[var(--cl-text-2)]">
                        {renderInline(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      continue;
    }

    if (/^[-*]{3,}$/.test(line.trim())) {
      elements.push(<hr key={`hr-${i}`} className="my-4 border-[var(--cl-border)]" />);
      continue;
    }

    const ulMatch = line.match(/^\s*[-*+]\s(.+)/);
    if (ulMatch) {
      const indent = line.search(/\S/);
      const level = Math.floor(indent / 2);
      elements.push(
        <div key={`li-${i}`} className="flex gap-2" style={{ paddingLeft: `${12 + level * 16}px` }}>
          <span className="text-[var(--cl-accent)] mt-0.5 flex-shrink-0">•</span>
          <span className="text-[15px] leading-relaxed">{renderInline(ulMatch[1])}</span>
        </div>
      );
      continue;
    }

    const olMatch = line.match(/^\s*(\d+)\.\s(.+)/);
    if (olMatch) {
      const indent = line.search(/\S/);
      const level = Math.floor(indent / 2);
      elements.push(
        <div key={`oli-${i}`} className="flex gap-2" style={{ paddingLeft: `${12 + level * 16}px` }}>
          <span className="text-[var(--cl-text-3)] text-xs mt-1 flex-shrink-0 font-mono">{olMatch[1]}.</span>
          <span className="text-[15px] leading-relaxed">{renderInline(olMatch[2])}</span>
        </div>
      );
      continue;
    }

    if (line.trimStart().startsWith('> ')) {
      elements.push(
        <div key={`bq-${i}`} className="border-l-2 border-[var(--cl-accent)]/50 pl-3 py-1 my-2 text-[var(--cl-text-2)] text-[15px] italic">
          {renderInline(line.trimStart().slice(2))}
        </div>
      );
      continue;
    }

    elements.push(
      <p key={`p-${i}`} className="text-[15px] leading-relaxed">
        {renderInline(line)}
      </p>
    );
  }

  return elements;
}

function renderInline(text) {
  if (!text) return '';

  // Never let the model's text become real HTML: a web page Selene reads could otherwise run code in this window
  text = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  text = text.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
  text = text.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
  // Only normal web and email links are clickable (no javascript: links)
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, label, url) => (
    /^(https?:\/\/|mailto:)/i.test(url.trim())
      ? `<a href="${url.trim()}" target="_blank" rel="noopener noreferrer" class="text-[var(--cl-accent)] hover:underline">${label}</a>`
      : m
  ));
  text = text.replace(/~~(.+?)~~/g, '<del>$1</del>');

  return <span dangerouslySetInnerHTML={{ __html: text }} />;
}

// ── Selene's reasoning, collapsed by default ──
function ThinkingBlock({ text, active }) {
  const [expanded, setExpanded] = useState(false);
  const words = text ? text.trim().split(/\s+/).length : 0;

  return (
    <div className="mb-2 rounded-lg border border-[var(--cl-border)] bg-[var(--cl-surface)]/60 overflow-hidden">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[var(--cl-hover)]/50 transition-colors"
      >
        <span className={`w-1.5 h-1.5 rounded-full bg-[var(--cl-accent)] flex-shrink-0 ${active ? 'animate-breathe' : 'opacity-50'}`} />
        <span className="text-xs font-medium text-[var(--cl-text-2)]">{active ? 'Thinking...' : 'Thought process'}</span>
        {words > 0 && <span className="text-[10px] text-[var(--cl-text-3)]">{words} words</span>}
        <span className="ml-auto text-[var(--cl-text-3)]">
          {expanded ? <ChevronDownIcon className="w-3 h-3" /> : <ChevronRightIcon className="w-3 h-3" />}
        </span>
      </button>
      {expanded && (
        <div className="px-3 pb-3 pt-2 text-xs text-[var(--cl-text-3)] leading-relaxed whitespace-pre-wrap break-words max-h-72 overflow-y-auto border-t border-[var(--cl-border)]">
          {text || '...'}
        </div>
      )}
    </div>
  );
}

// ── Tool call item (shown inside assistant messages) ──
function ToolCallItem({ toolCall }) {
  const [expanded, setExpanded] = useState(false);
  const { name, arguments: args } = toolCall.function;

  const getIcon = () => {
    switch (name) {
      case 'run_command': return <TerminalIcon className="w-3.5 h-3.5" />;
      case 'web_search': return <GlobeIcon className="w-3.5 h-3.5" />;
      case 'read_url': return <FileTextIcon className="w-3.5 h-3.5" />;
      default: return <FunctionIcon className="w-3.5 h-3.5" />;
    }
  };

  const getSummary = () => {
    switch (name) {
      case 'run_command': return args.command || '';
      case 'web_search': return args.query || '';
      case 'read_url': return args.url || '';
      case 'delegate_to_agents': return Array.isArray(args.agents) ? args.agents.map((a) => a.role).join(', ') : '';
      default: return JSON.stringify(args).slice(0, 80);
    }
  };

  const getColor = () => {
    switch (name) {
      case 'run_command': return 'text-emerald-400';
      case 'web_search': return 'text-sky-400';
      case 'read_url': return 'text-violet-400';
      case 'delegate_to_agents': return 'text-pink-400';
      default: return 'text-amber-400';
    }
  };

  return (
    <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-[var(--cl-surface)] border border-[var(--cl-border)]">
      <div className={`mt-0.5 flex-shrink-0 ${getColor()}`}>
        {getIcon()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold capitalize ${getColor()}`}>
            {name.replace(/_/g, ' ')}
          </span>
          <button
            onClick={() => setExpanded(!expanded)}
            className="ml-auto flex items-center gap-0.5 text-[10px] font-medium text-[var(--cl-text-3)] hover:text-[var(--cl-text)] transition-colors"
          >
            {expanded ? (
              <><ChevronDownIcon className="w-3 h-3" /> Less</>
            ) : (
              <><ChevronRightIcon className="w-3 h-3" /> Details</>
            )}
          </button>
        </div>
        {!expanded && (
          <p className="text-xs text-[var(--cl-text-3)] mt-0.5 truncate font-mono">
            {getSummary()}
          </p>
        )}
        {expanded && (
          <div className="mt-2 text-xs font-mono text-[var(--cl-text-2)] bg-[var(--cl-bg)] rounded-lg p-2.5 border border-[var(--cl-border)] whitespace-pre-wrap break-words leading-relaxed">
            {name === 'run_command' && args.command ? (
              <>$ {args.command}</>
            ) : name === 'web_search' && args.query ? (
              <>Search: {args.query}</>
            ) : name === 'read_url' && args.url ? (
              <>URL: {args.url}</>
            ) : (
              JSON.stringify(args, null, 2)
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Tool result message ──
function ToolResultMessage({ content, timestamp }) {
  const [collapsed, setCollapsed] = useState(false);

  const isCommandOutput = content?.startsWith('$') || content?.startsWith('⚠') || content?.startsWith('✅');

  return (
    <div className="flex justify-start w-full animate-fade-in">
      <div className="max-w-[85%] lg:max-w-[75%] w-full">
        <div className="bg-[var(--cl-surface)] border border-[var(--cl-border-2)] rounded-xl overflow-hidden shadow-sm">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex items-center gap-2 w-full px-4 py-2 border-b border-[var(--cl-border-2)] bg-[var(--cl-hover)]/30 hover:bg-[var(--cl-hover)]/60 transition-colors text-left"
          >
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--cl-text-3)]">
              {isCommandOutput ? 'Command Output' : 'Tool Result'}
            </span>
            <span className="text-[10px] text-[var(--cl-text-3)]">{formatTime(timestamp)}</span>
            <span className="ml-auto text-[var(--cl-text-3)]">
              {collapsed ? <ChevronRightIcon className="w-3 h-3" /> : <ChevronDownIcon className="w-3 h-3" />}
            </span>
          </button>
          {!collapsed && (
            <pre className="text-xs font-mono text-[var(--cl-text-2)] p-4 overflow-x-auto whitespace-pre-wrap break-words max-h-80 overflow-y-auto leading-relaxed">
              {content}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

function Message({ message, isStreaming, onEdit, onDelete, onRegenerate, searchQuery }) {
  const [showActions, setShowActions] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(message.content);
  const editRef = useRef(null);

  useEffect(() => {
    if (editing && editRef.current) {
      editRef.current.focus();
      editRef.current.setSelectionRange(editValue.length, editValue.length);
    }
  }, [editing]);

  const isUser = message.role === 'user';
  const isTool = message.role === 'tool';
  const hasToolCalls = message.tool_calls && message.tool_calls.length > 0;
  // Split Selene's reasoning (<think> tags) from the visible answer
  const parts = splitThinking(isUser ? '' : message.content);

  const handleSaveEdit = () => {
    if (editValue.trim() && editValue !== message.content) {
      onEdit?.(message.id, editValue.trim());
    }
    setEditing(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSaveEdit();
    }
    if (e.key === 'Escape') {
      setEditing(false);
      setEditValue(message.content);
    }
  };

  const handleDelete = () => {
    onDelete?.(message.id);
  };

  // ── Tool result message ──
  if (isTool) {
    return <ToolResultMessage content={message.content} timestamp={message.timestamp} />;
  }

  if (editing) {
    return (
      <div className="flex justify-end w-full animate-fade-in">
        <div className="max-w-[85%] lg:max-w-[75%] w-full">
          <div className="bg-[var(--cl-surface)] border border-[var(--cl-accent)]/50 rounded-2xl overflow-hidden shadow-sm">
            <textarea
              ref={editRef}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full bg-transparent resize-none outline-none text-[15px] p-3 text-[var(--cl-text)] leading-relaxed"
              rows={Math.min(editValue.split('\n').length, 8)}
            />
            <div className="flex items-center justify-end gap-2 px-3 pb-3">
              <button
                onClick={() => {
                  setEditing(false);
                  setEditValue(message.content);
                }}
                className="px-3 py-1.5 text-xs text-[var(--cl-text-3)] hover:text-[var(--cl-text)] rounded-lg hover:bg-[var(--cl-hover)] transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={!editValue.trim()}
                className="px-4 py-1.5 text-xs bg-[var(--cl-accent)] hover:bg-[var(--cl-accent-h)] text-white rounded-lg transition-all disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const hasSearchMatch = searchQuery && searchQuery.trim() && message.content?.toLowerCase().includes(searchQuery.toLowerCase());

  if (isUser) {
    return (
      <div
        className={`flex justify-end w-full animate-fade-in group ${hasSearchMatch ? 'ring-1 ring-[var(--cl-accent)]/30 rounded-2xl' : ''}`}
        onMouseEnter={() => setShowActions(true)}
        onMouseLeave={() => setShowActions(false)}
      >
        <div className="max-w-[85%] lg:max-w-[75%]">
          <div className="bg-[var(--cl-accent-subtle)] border border-[var(--cl-accent)]/20 text-[var(--cl-text)] text-[15px] leading-relaxed px-5 py-3 rounded-2xl rounded-br-md break-words shadow-sm relative">
            <p className="whitespace-pre-wrap break-words">{message.content}</p>
            <div className="flex items-center justify-end gap-1 mt-1">
              {showActions && (
                <div className="flex items-center gap-0.5 animate-fade-in">
                  <button
                    onClick={() => {
                      setEditing(true);
                      setEditValue(message.content);
                    }}
                    className="p-1 rounded-md text-[var(--cl-text-3)] hover:text-[var(--cl-text)] hover:bg-[var(--cl-surface)] transition-all"
                    title="Edit"
                  >
                    <EditIcon className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={handleDelete}
                    className="p-1 rounded-md text-[var(--cl-text-3)] hover:text-red-400 hover:bg-red-400/10 transition-all"
                    title="Delete"
                  >
                    <TrashIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              <span className="text-[10px] text-[var(--cl-text-3)] select-none">
                {formatTime(message.timestamp)}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Assistant message (with optional tool calls) ──
  return (
    <div
      className={`flex gap-3 items-start w-full animate-fade-in group ${hasSearchMatch ? 'ring-1 ring-[var(--cl-accent)]/30 rounded-2xl' : ''}`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <div className="flex-shrink-0 mt-0.5">
        <div className="w-7 h-7 rounded-lg bg-[var(--cl-accent-subtle)] flex items-center justify-center">
          <MoonIcon className="w-4 h-4 text-[var(--cl-accent)]" />
        </div>
      </div>
      <div className="flex-1 min-w-0 w-full text-[var(--cl-text)] leading-relaxed break-words space-y-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium text-[var(--cl-text)]">Selene</span>
          <span className="text-[10px] text-[var(--cl-text-3)]">{formatTime(message.timestamp)}</span>
          {hasToolCalls && (
            <span className="flex items-center gap-1 text-[10px] font-medium text-[var(--cl-accent)] bg-[var(--cl-accent-subtle)] px-1.5 py-0.5 rounded-md">
              <FunctionIcon className="w-2.5 h-2.5" />
              {message.tool_calls.length} tool{message.tool_calls.length > 1 ? 's' : ''}
            </span>
          )}
          {showActions && !isStreaming && (
            <div className="flex items-center gap-0.5 animate-fade-in ml-auto">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(parts.answer || message.content);
                }}
                className="p-1 rounded-md text-[var(--cl-text-3)] hover:text-[var(--cl-text)] hover:bg-[var(--cl-hover)] transition-all"
                title="Copy message"
              >
                <CopyIcon className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => onRegenerate?.(message.id)}
                className="p-1 rounded-md text-[var(--cl-text-3)] hover:text-[var(--cl-accent)] hover:bg-[var(--cl-accent-subtle)] transition-all"
                title="Regenerate"
              >
                <RefreshIcon className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleDelete}
                className="p-1 rounded-md text-[var(--cl-text-3)] hover:text-red-400 hover:bg-red-400/10 transition-all"
                title="Delete"
              >
                <TrashIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Tool calls section */}
        {hasToolCalls && (
          <div className="mb-3 space-y-1.5">
            {message.tool_calls.map((tc, i) => (
              <ToolCallItem key={tc.id || i} toolCall={tc} />
            ))}
          </div>
        )}

        {/* Thinking (collapsible) */}
        {(parts.thinking || parts.open) && (
          <ThinkingBlock text={parts.thinking} active={isStreaming && parts.open} />
        )}

        {/* Content */}
        {parts.answer && (
          <div className={`${isStreaming && !parts.open ? 'typing-cursor' : ''} px-2 pb-1`}>
            {renderMarkdown(parts.answer)}
          </div>
        )}

        {/* Streaming dots when no content yet */}
        {isStreaming && !message.content && !hasToolCalls && (
          <div className="flex gap-1.5 py-2">
            <span className="w-2 h-2 rounded-full bg-[var(--cl-accent)] animate-breathe" />
            <span className="w-2 h-2 rounded-full bg-[var(--cl-accent)] animate-breathe" style={{ animationDelay: '0.3s' }} />
            <span className="w-2 h-2 rounded-full bg-[var(--cl-accent)] animate-breathe" style={{ animationDelay: '0.6s' }} />
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(Message);
