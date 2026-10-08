// Keeps the Groq and OpenAI model lists up to date by asking each provider which models it offers.
// Falls back to the built-in lists in types.js when offline or when the key cannot list models.
import { useEffect, useState } from 'react';

const CLOUD = ['groq', 'openai'];
const ENDPOINTS = {
  groq: 'https://api.groq.com/openai/v1/models',
  openai: 'https://api.openai.com/v1/models',
};
// Things that are not chat models (speech, images, embeddings, safety filters...)
const NOT_CHAT = /whisper|tts|guard|orpheus|embed|moderation|transcribe|realtime|audio|image|dall-e|sora|davinci|babbage|search|computer-use|codex|instruct/i;
const REFRESH_MS = 30 * 60 * 1000;
const cache = {}; // provider -> { key, at, models }

// Turns the provider's /models answer into a clean list of chat model ids (exported so it can be tested).
export function pickChatModels(provider, data) {
  let list = (data || []).filter((m) => m && m.id && m.active !== false && !NOT_CHAT.test(m.id));
  if (provider === 'openai') {
    // Only the main families, without dated snapshots like gpt-4o-2024-08-06 or gpt-4-0613
    list = list.filter((m) => /^(gpt-|o\d|chatgpt-)/.test(m.id) && !/\d{4}-\d{2}-\d{2}$|-\d{4}$|-preview/.test(m.id));
    list.sort((a, b) => (b.created || 0) - (a.created || 0));
  } else {
    list.sort((a, b) => a.id.localeCompare(b.id));
  }
  return list.map((m) => m.id);
}

export async function fetchCloudModels(provider, apiKey) {
  const url = ENDPOINTS[provider];
  if (!url || !apiKey) return null;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!resp.ok) return null;
  const json = await resp.json();
  const ids = pickChatModels(provider, json.data);
  return ids.length ? ids : null;
}

// Returns { groq: [...], openai: [...] } for the providers that answered. Refreshes on start, when a key
// changes, and every 30 minutes. Providers that did not answer are missing, so callers use their fallback.
export function useCloudModels(apiKeys) {
  const [lists, setLists] = useState({});
  const sig = CLOUD.map((p) => {
    const k = (apiKeys || []).find((x) => x.provider === p);
    return k && k.key ? k.key : '';
  }).join('|');

  useEffect(() => {
    let dead = false;
    const run = () => {
      for (const p of CLOUD) {
        const k = (apiKeys || []).find((x) => x.provider === p);
        if (!k || !k.key) continue;
        const hit = cache[p];
        if (hit && hit.key === k.key && Date.now() - hit.at < REFRESH_MS / 2) {
          setLists((l) => (l[p] === hit.models ? l : { ...l, [p]: hit.models }));
          continue;
        }
        fetchCloudModels(p, k.key)
          .then((models) => {
            if (dead || !models) return;
            cache[p] = { key: k.key, at: Date.now(), models };
            setLists((l) => ({ ...l, [p]: models }));
          })
          .catch(() => {});
      }
    };
    run();
    const timer = setInterval(run, REFRESH_MS);
    return () => { dead = true; clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  return lists;
}
