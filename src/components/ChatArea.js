import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import MessageComponent from './Message';
import { MoonIcon, SparkleIcon, ArrowDownIcon, SearchIcon, CloseIcon } from './icons';

function formatDateLabel(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msgDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((today - msgDate) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return d.toLocaleDateString('en-US', { weekday: 'long' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
}

function shouldShowDateLabel(msg, prevMsg) {
  if (!prevMsg) return true;
  const d1 = new Date(msg.timestamp);
  const d2 = new Date(prevMsg.timestamp);
  return d1.toDateString() !== d2.toDateString();
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

const suggestions = [
  'Write a Python script to sort files by type',
  'Explain how REST APIs work',
  'Help me debug my React component',
  'Summarize this concept in simple terms',
];



export default function ChatArea({
  messages,
  isStreaming,
  onSendSuggestion,
  onEditMessage,
  onDeleteMessage,
  onRegenerate,
  activeChatId,
}) {
  const scrollContainerRef = useRef(null);
  const bottomRef = useRef(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMatches, setSearchMatches] = useState([]);
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const searchInputRef = useRef(null);

  // Stable callbacks, so messages that did not change are not redrawn on every streamed chunk
  const handleEdit = useCallback((msgId, content) => onEditMessage?.(activeChatId, msgId, content), [onEditMessage, activeChatId]);
  const handleDelete = useCallback((msgId) => onDeleteMessage?.(activeChatId, msgId), [onDeleteMessage, activeChatId]);
  const handleRegenerate = useCallback(() => onRegenerate?.(activeChatId), [onRegenerate, activeChatId]);

  // ── Scroll handling ──
  const scrollToBottom = useCallback((smooth = true) => {
    bottomRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'instant' });
    setShowScrollButton(false);
    setIsNearBottom(true);
  }, []);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const diff = el.scrollHeight - el.scrollTop - el.clientHeight;
    const near = diff < 200;
    setIsNearBottom(near);
    if (near) {
      setShowScrollButton(false);
    } else if (!isStreaming) {
      setShowScrollButton(false);
    } else {
      setShowScrollButton(true);
    }
  }, [isStreaming]);

  // Auto-scroll during streaming if near bottom
  useEffect(() => {
    if (isStreaming && isNearBottom) {
      bottomRef.current?.scrollIntoView({ behavior: 'instant' }); // smooth scrolling on every chunk stutters
    }
  }, [messages, isStreaming, isNearBottom]);

  // ── Chat search ──
  const computeMatches = useCallback(() => {
    if (!searchQuery.trim()) {
      // Only touch state if something changed (otherwise every streamed chunk causes an extra redraw)
      setSearchMatches((prev) => (prev.length === 0 ? prev : []));
      setActiveMatchIndex((prev) => (prev === 0 ? prev : 0));
      return;
    }
    const escaped = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'gi');
    const matches = [];
    messages.forEach((msg, msgIdx) => {
      let count = 0;
      let m;
      while ((m = regex.exec(msg.content)) !== null) {
        matches.push({ msgIdx, matchIdx: count, index: m.index });
        count++;
      }
    });
    setSearchMatches(matches);
    setActiveMatchIndex(matches.length > 0 ? 0 : -1);
  }, [messages, searchQuery]);

  useEffect(() => {
    computeMatches();
  }, [computeMatches]);

  useEffect(() => {
    if (searchOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [searchOpen]);

  const navigateMatch = useCallback((direction) => {
    if (searchMatches.length === 0) return;
    const next = direction === 'next'
      ? (activeMatchIndex + 1) % searchMatches.length
      : (activeMatchIndex - 1 + searchMatches.length) % searchMatches.length;
    setActiveMatchIndex(next);
  }, [searchMatches, activeMatchIndex]);

  // Scroll to active match
  useEffect(() => {
    if (activeMatchIndex < 0 || searchMatches.length === 0) return;
    const match = searchMatches[activeMatchIndex];
    if (!match) return;
    const msgEl = document.querySelector(`[data-msg-idx="${match.msgIdx}"]`);
    if (msgEl) {
      msgEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeMatchIndex, searchMatches]);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handleKeyDown = (e) => {
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && e.key === 'f' && messages.length > 0) {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
        if (!searchOpen) setSearchQuery('');
        return;
      }
      if (searchOpen && e.key === 'Escape') {
        setSearchOpen(false);
        setSearchQuery('');
        return;
      }
      if (searchOpen && e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) navigateMatch('prev');
        else navigateMatch('next');
        return;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [messages.length, searchOpen, navigateMatch]);

  // ── Empty state ──
  if (messages.length === 0) {
    return (
      <div
        className="flex-1 min-h-0 flex flex-col items-center justify-center px-6 relative"
        style={{ background: 'var(--cl-bg-gradient)' }}
      >
        <div className="animate-slide-up text-center">
          <div className="w-14 h-14 rounded-2xl bg-[var(--cl-accent-subtle)] flex items-center justify-center mx-auto mb-5 animate-pulse-glow">
            <MoonIcon className="w-7 h-7 text-[var(--cl-accent)]" />
          </div>
          <h1 className="text-3xl font-medium text-[var(--cl-text)] tracking-tight">
            {getGreeting()}
          </h1>
          <p className="text-sm text-[var(--cl-text-3)] mt-2">
            How can I help you today?
          </p>
        </div>

        <div
          className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg animate-fade-in"
          style={{ animationDelay: '0.2s', animationFillMode: 'both' }}
        >
          {suggestions.map((suggestion, i) => (
            <button
              key={i}
              onClick={() => onSendSuggestion?.(suggestion)}
              className="group flex items-start gap-2.5 px-4 py-3 rounded-xl border border-[var(--cl-border)] hover:border-[var(--cl-border-3)] bg-[var(--cl-surface)] hover:bg-[var(--cl-hover)] transition-all duration-200 text-left"
              style={{ animationDelay: `${0.3 + i * 0.08}s`, animationFillMode: 'both' }}
            >
              <SparkleIcon className="w-4 h-4 text-[var(--cl-accent)] mt-0.5 flex-shrink-0 group-hover:scale-110 transition-transform" />
              <span className="text-sm text-[var(--cl-text-2)] group-hover:text-[var(--cl-text)] transition-colors leading-snug">
                {suggestion}
              </span>
            </button>
          ))}
        </div>

        <div ref={bottomRef} />
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 relative flex flex-col">
      {/* Search overlay */}
      {searchOpen && (
        <div className="absolute top-0 left-0 right-0 z-20 animate-fade-in">
          <div className="bg-[var(--cl-surface)] border-b border-[var(--cl-border-2)] px-4 py-2 flex items-center gap-2 shadow-lg">
            <SearchIcon className="w-4 h-4 text-[var(--cl-text-3)] flex-shrink-0" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search in this chat..."
              className="flex-1 bg-transparent text-sm text-[var(--cl-text)] outline-none placeholder-[var(--cl-text-3)]"
            />
            {searchMatches.length > 0 && (
              <span className="text-xs text-[var(--cl-text-3)] whitespace-nowrap">
                {activeMatchIndex + 1} / {searchMatches.length}
              </span>
            )}
            <div className="flex items-center gap-1">
              <button
                onClick={() => navigateMatch('prev')}
                disabled={searchMatches.length === 0}
                className="p-1.5 rounded-md text-[var(--cl-text-3)] hover:text-[var(--cl-text)] hover:bg-[var(--cl-hover)] transition-all disabled:opacity-30"
                title="Previous match (Shift+Enter)"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <polyline points="18 15 12 9 6 15" />
                </svg>
              </button>
              <button
                onClick={() => navigateMatch('next')}
                disabled={searchMatches.length === 0}
                className="p-1.5 rounded-md text-[var(--cl-text-3)] hover:text-[var(--cl-text)] hover:bg-[var(--cl-hover)] transition-all disabled:opacity-30"
                title="Next match (Enter)"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
            </div>
            <button
              onClick={() => { setSearchOpen(false); setSearchQuery(''); }}
              className="p-1.5 rounded-md text-[var(--cl-text-3)] hover:text-[var(--cl-text)] hover:bg-[var(--cl-hover)] transition-all"
              title="Close search (Esc)"
            >
              <CloseIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Scroll container */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto w-full"
        style={{ background: 'var(--cl-bg-gradient)' }}
      >
        <div className="w-full px-10 md:px-16 lg:px-24 xl:px-32 pt-6 space-y-5 pb-4">
          {messages.map((msg, idx) => {
            const elements = [];
            if (shouldShowDateLabel(msg, messages[idx - 1])) {
              elements.push(
                <div key={`date-${msg.id}`} className="flex items-center gap-3 pt-2 pb-1">
                  <div className="flex-1 h-px bg-[var(--cl-border)]" />
                  <span className="text-xs text-[var(--cl-text-3)] font-medium px-2 select-none">
                    {formatDateLabel(msg.timestamp)}
                  </span>
                  <div className="flex-1 h-px bg-[var(--cl-border)]" />
                </div>
              );
            }
            elements.push(
              <div key={msg.id} data-msg-idx={idx}>
                <MessageComponent
                  message={msg}
                  isStreaming={isStreaming && idx === messages.length - 1 && msg.role === 'assistant'}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onRegenerate={handleRegenerate}
                  searchQuery={searchOpen ? searchQuery : ''}
                />
              </div>
            );
            return elements;
          })}
          <div ref={bottomRef} className="h-2" />
        </div>
      </div>

      {/* Jump to bottom FAB */}
      {showScrollButton && (
        <button
          onClick={() => scrollToBottom(true)}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--cl-surface)] border border-[var(--cl-border-2)] shadow-lg hover:bg-[var(--cl-hover)] hover:border-[var(--cl-accent)]/50 text-[var(--cl-text-2)] hover:text-[var(--cl-text)] transition-all duration-200 animate-fade-in group"
          title="Jump to latest"
        >
          <ArrowDownIcon className="w-4 h-4 group-hover:animate-bounce" />
          <span className="text-xs font-medium">Jump to bottom</span>
        </button>
      )}
    </div>
  );
}
