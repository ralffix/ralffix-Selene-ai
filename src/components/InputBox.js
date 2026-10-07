import { useRef, useEffect } from 'react';
import { ArrowUpIcon, PlusIcon, StopIcon } from './icons';

const THINKING_CYCLE = ['off', 'light', 'normal', 'deep'];
const THINKING_LABELS = { off: 'Think', light: 'Think: light', normal: 'Think: normal', deep: 'Think: deep' };
const THINKING_TIPS = {
  off: 'Thinking is off. Click to turn it on.',
  light: 'Thinking: light. Click for the next level.',
  normal: 'Thinking: normal. Click for the next level.',
  deep: 'Thinking: deep. Click to turn it off.',
};

function BulbIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18h6" />
      <path d="M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" />
    </svg>
  );
}

export default function InputBox({ value, onChange, onSend, onStop, onNewChat, disabled, placeholder, isStreaming, thinking = 'off', onThinkingChange }) {
  const textareaRef = useRef(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea && !isStreaming) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [value, isStreaming]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !disabled && !isStreaming) {
        onSend();
      }
    }
  };

  const canSend = value.trim() && !disabled && !isStreaming;

  return (
    <div className="flex-shrink-0 w-full pb-6 pt-2 flex flex-col items-center">
      <div className="w-full max-w-4xl px-4 md:px-6">
        <div
          className={`relative bg-[var(--cl-surface)] border rounded-2xl shadow-sm transition-all duration-300 ${
            isStreaming
              ? 'border-[var(--cl-accent)]/50 animate-pulse-glow'
              : 'border-[var(--cl-border-2)] focus-within:border-[var(--cl-accent)]/50 focus-within:shadow-[0_0_0_1px_var(--cl-accent-glow),0_0_20px_var(--cl-accent-glow)]'
          }`}
        >
          <div className="flex items-end gap-2 p-3">
            <button
              type="button"
              onClick={onNewChat}
              title="New chat"
              className="flex-shrink-0 p-2 rounded-lg text-[var(--cl-text-3)] hover:text-[var(--cl-text-2)] hover:bg-[var(--cl-border-2)] transition-all duration-200 mb-0.5"
            >
              <PlusIcon className="w-5 h-5" />
            </button>

            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isStreaming ? 'Selene is responding...' : (placeholder || 'Reply to Selene...')}
              rows={1}
              disabled={disabled || isStreaming}
              className="flex-1 bg-transparent resize-none outline-none text-[15px] py-2 max-h-[200px] placeholder-[var(--cl-text-3)] text-[var(--cl-text)] leading-relaxed"
            />

            {onThinkingChange && (
              <button
                type="button"
                onClick={() => {
                  const next = THINKING_CYCLE[(THINKING_CYCLE.indexOf(thinking) + 1) % THINKING_CYCLE.length];
                  onThinkingChange(next);
                }}
                title={THINKING_TIPS[thinking] || THINKING_TIPS.off}
                className={`flex-shrink-0 flex items-center gap-1.5 px-2.5 h-8 rounded-lg text-xs font-medium border transition-all duration-200 mb-0.5 ${
                  thinking !== 'off'
                    ? 'bg-[var(--cl-accent-subtle)] text-[var(--cl-accent)] border-[var(--cl-accent)]/30'
                    : 'text-[var(--cl-text-3)] hover:text-[var(--cl-text-2)] hover:bg-[var(--cl-border-2)] border-transparent'
                }`}
              >
                <BulbIcon className="w-3.5 h-3.5" />
                <span>{THINKING_LABELS[thinking] || 'Think'}</span>
              </button>
            )}

            {isStreaming ? (
              <button
                onClick={onStop}
                className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center bg-white/10 hover:bg-white/20 text-white transition-all duration-200 mb-0.5 animate-fade-in"
                title="Stop generation"
              >
                <StopIcon className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={onSend}
                disabled={!canSend}
                className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200 mb-0.5 ${
                  canSend
                    ? 'bg-[var(--cl-accent)] hover:bg-[var(--cl-accent-h)] text-white shadow-sm hover:shadow-md active:scale-95'
                    : 'bg-[var(--cl-border-2)] text-[var(--cl-text-3)] cursor-not-allowed'
                }`}
              >
                <ArrowUpIcon className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
        <p className="text-center text-xs text-[var(--cl-text-3)] mt-2">
          Selene can make mistakes. Please double-check responses.
        </p>
      </div>
    </div>
  );
}
