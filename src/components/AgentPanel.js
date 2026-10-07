// Shows the helper agents while they work: one small card per agent with its status.

function StatusDot({ status }) {
  if (status === 'done') {
    return <span className="mt-0.5 text-emerald-400 text-xs flex-shrink-0">✓</span>;
  }
  if (status === 'error') {
    return <span className="mt-0.5 text-red-400 text-xs flex-shrink-0">✕</span>;
  }
  if (status === 'working') {
    return <span className="mt-1.5 w-2 h-2 rounded-full bg-[var(--cl-accent)] animate-breathe flex-shrink-0" />;
  }
  return <span className="mt-1.5 w-2 h-2 rounded-full bg-[var(--cl-text-3)]/40 flex-shrink-0" />;
}

export default function AgentPanel({ run }) {
  if (!run || !run.agents || run.agents.length === 0) return null;

  const total = run.agents.length;
  const done = run.agents.filter((a) => a.status === 'done' || a.status === 'error').length;

  return (
    <div className="mx-3 mb-2 px-4 py-3 rounded-xl border border-[var(--cl-border-2)] bg-[var(--cl-surface)] animate-fade-in">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-medium uppercase tracking-wider text-[var(--cl-text-3)]">
          {run.finished ? 'Agents finished' : 'Agents working together'}
        </span>
        <span className="text-[10px] text-[var(--cl-text-3)]">{done} / {total} done</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {run.agents.map((agent, i) => (
          <div
            key={i}
            className="flex items-start gap-2 px-3 py-2 rounded-lg bg-[var(--cl-bg)] border border-[var(--cl-border)] min-w-[170px] max-w-[280px]"
          >
            <StatusDot status={agent.status} />
            <div className="min-w-0">
              <p className="text-xs font-medium text-[var(--cl-text)] truncate">{agent.role}</p>
              <p className="text-[11px] text-[var(--cl-text-3)] truncate">{agent.note || agent.task}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
