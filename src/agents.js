// Helper agents: several agents work on parts of a job at the same time.
// The lead assistant (Selene) decides how many to start and what each one does,
// the agents run in parallel as separate AI requests, and their reports go back to Selene.

import { getEndpoint } from './types';
import { stripThinking } from './thinking';
import { PROMPT_DEFAULTS, fillPrompt } from './prompts';

const MAX_STEPS = 3;    // rounds per agent: up to 2 tool rounds, then the final report
const STAGGER_MS = 250; // small delay between agent starts so they do not all hit the API in the same instant

function abortError() {
  return new DOMException('Aborted', 'AbortError');
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) { reject(abortError()); return; }
    const timer = setTimeout(resolve, ms);
    if (signal) {
      signal.addEventListener('abort', () => { clearTimeout(timer); reject(abortError()); }, { once: true });
    }
  });
}

// Providers say things like "Please try again in 7.38s". Returns ms to wait, or null.
function parseWaitMs(message) {
  const m = (message || '').match(/try again in ((?:\d+h)?(?:\d+m(?!s))?(?:[\d.]+s)?(?:[\d.]+ms)?)/i);
  if (!m || !m[1]) return null;
  const t = m[1];
  const h = t.match(/(\d+)h/);
  const mi = t.match(/(\d+)m(?!s)/);
  const s = t.match(/([\d.]+)s/);
  const msPart = t.match(/([\d.]+)ms/);
  const ms = (h ? Number(h[1]) * 3600000 : 0) + (mi ? Number(mi[1]) * 60000 : 0)
    + (s ? Number(s[1]) * 1000 : 0) + (msPart ? Number(msPart[1]) : 0) + 500;
  if (ms <= 500 || ms > 30000) return null;
  return ms;
}

// One non-streaming request. Waits and retries when the provider asks for a short pause.
async function callModel({ key, model, messages, tools, maxTokens, reasoningEffort, signal, onWait }) {
  const endpoint = getEndpoint(key);
  const headers = { 'Content-Type': 'application/json' };
  if (key.provider !== 'ollama') headers.Authorization = `Bearer ${key.key}`;

  const payload = { model, messages, temperature: 0.5, max_tokens: maxTokens, stream: false };
  if (reasoningEffort) payload.reasoning_effort = reasoningEffort;
  if (tools && tools.length > 0) {
    payload.tools = tools;
    payload.tool_choice = 'auto';
  }

  for (let attempt = 0; ; attempt++) {
    const resp = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(payload), signal });
    if (resp.ok) {
      const data = await resp.json();
      const choice = data.choices?.[0];
      return { ...(choice?.message || { content: '' }), finish_reason: choice?.finish_reason };
    }
    const text = await resp.text();
    let message = `HTTP ${resp.status}`;
    try { message = JSON.parse(text).error?.message || message; } catch { /* keep the HTTP status */ }
    const wait = resp.status === 429 ? parseWaitMs(message) : null;
    if (wait !== null && attempt < 2) {
      if (onWait) onWait(wait);
      await sleep(wait, signal);
      continue;
    }
    throw new Error(message);
  }
}

function agentSystemPrompt(agent, sharedContext, hasTools, prompts) {
  const P = { ...PROMPT_DEFAULTS, ...(prompts || {}) }; // the user's edits from Settings, Prompts
  return [
    fillPrompt(P.agentIntro, { role: agent.role }),
    sharedContext ? `Background:\n${sharedContext}` : '',
    P.agentRules,
    hasTools ? P.agentTools : '',
  ].filter(Boolean).join('\n\n');
}

async function runAgent(agent, ctx, report) {
  const messages = [
    { role: 'system', content: agentSystemPrompt(agent, ctx.sharedContext, ctx.tools.length > 0, ctx.prompts) },
    { role: 'user', content: agent.task },
  ];
  const allowed = ctx.tools.map((t) => t.function.name);

  for (let step = 0; step < MAX_STEPS; step++) {
    const canUseTools = ctx.tools.length > 0 && step < MAX_STEPS - 1;
    const msg = await callModel({
      key: ctx.key,
      model: ctx.model,
      messages,
      tools: canUseTools ? ctx.tools : null,
      maxTokens: ctx.maxTokens,
      reasoningEffort: ctx.reasoningEffort,
      signal: ctx.signal,
      onWait: (ms) => report({ note: `rate limited, waiting ${Math.ceil(ms / 1000)}s` }),
    });

    const calls = msg.tool_calls;
    if (canUseTools && calls && calls.length > 0) {
      messages.push({ role: 'assistant', content: msg.content || null, tool_calls: calls });
      for (const tc of calls) {
        const name = tc.function.name;
        let args = {};
        try { args = JSON.parse(tc.function.arguments || '{}'); } catch { args = {}; }
        report({ note: name === 'web_search' ? `searching: ${args.query || ''}` : name === 'read_url' ? `reading: ${args.url || ''}` : name });

        let out;
        if (!allowed.includes(name)) {
          out = 'That tool is not available to helper agents.';
        } else {
          try { out = await ctx.runTool(name, args); } catch (err) { out = `Error: ${err && err.message ? err.message : err}`; }
        }
        messages.push({ role: 'tool', tool_call_id: tc.id, content: ctx.capOutput(out) });
      }
      report({ note: 'writing report' });
      continue;
    }

    const text = stripThinking(msg.content || '').trim();
    if (text) return text;
    return msg.finish_reason === 'length'
      ? '(This agent ran out of tokens before it could write its report.)'
      : '(This agent did not write a report.)';
  }
  return '(This agent did not write a report.)';
}

/**
 * Runs all agents at the same time and returns their reports as one text block.
 * ctx: { agents, sharedContext, key, model, maxTokens, reasoningEffort, tools, runTool,
 *        capOutput, reportChars, signal, onUpdate(index, patch) }
 */
export async function runAgents(ctx) {
  const { agents, onUpdate, signal } = ctx;

  const results = await Promise.allSettled(agents.map(async (agent, i) => {
    await sleep(i * STAGGER_MS, signal);
    onUpdate(i, { status: 'working', note: 'starting' });
    try {
      const text = await runAgent(agent, ctx, (patch) => onUpdate(i, patch));
      onUpdate(i, { status: 'done', note: 'finished' });
      return text;
    } catch (err) {
      onUpdate(i, { status: 'error', note: err && err.name === 'AbortError' ? 'stopped' : (err && err.message) || 'failed' });
      throw err;
    }
  }));

  if (signal && signal.aborted) return 'The user stopped the agents.';

  return results.map((r, i) => {
    const head = `## Agent ${i + 1}: ${agents[i].role}`;
    if (r.status === 'fulfilled') {
      const text = r.value.length > ctx.reportChars ? r.value.slice(0, ctx.reportChars) + '\n...[report shortened]' : r.value;
      return `${head}\n${text}`;
    }
    return `${head}\nThis agent failed: ${r.reason && r.reason.message ? r.reason.message : r.reason}`;
  }).join('\n\n');
}
