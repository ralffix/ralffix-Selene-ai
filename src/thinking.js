// Helpers for "thinking": the model's reasoning lives inside <think>...</think> tags.
// Some models write those tags themselves, others are asked to by the system prompt,
// and reasoning that arrives in a separate API field gets wrapped in the same tags.

const OPEN = '<think>';
const CLOSE = '</think>';

// Remove a half-streamed tag at the very end (like "<thi") so it never flashes on screen
function trimPartialTag(text) {
  return text.replace(/<\/?(?:t(?:h(?:i(?:n(?:k)?)?)?)?)?$/, '');
}

/**
 * Split a message into its reasoning and its visible answer.
 * `open` is true while the reasoning is still being written (no closing tag yet).
 */
export function splitThinking(content) {
  if (!content) return { thinking: '', answer: '', open: false };

  const thoughts = [];
  let answer = '';
  let rest = content;
  let open = false;

  while (rest.length > 0) {
    const start = rest.indexOf(OPEN);
    if (start === -1) {
      answer += rest;
      break;
    }
    answer += rest.slice(0, start);
    const after = rest.slice(start + OPEN.length);
    const end = after.indexOf(CLOSE);
    if (end === -1) {
      thoughts.push(after);
      open = true;
      break;
    }
    thoughts.push(after.slice(0, end));
    rest = after.slice(end + CLOSE.length);
  }

  return {
    thinking: trimPartialTag(thoughts.join('\n\n')).trim(),
    answer: trimPartialTag(answer).replace(/^\s+/, ''),
    open,
  };
}

/** The message without any reasoning. Used for history, file parsing and exports. */
export function stripThinking(content) {
  if (!content || !content.includes(OPEN)) return content;
  return splitThinking(content).answer;
}
