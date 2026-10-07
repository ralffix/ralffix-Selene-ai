export const PROVIDER_LABELS = {
  groq: 'Groq API',
  openai: 'OpenAI API',
  ollama: 'Ollama (Local)',
  custom: 'Local model (GGUF)',
};

export const PROVIDER_SHORT_LABELS = {
  groq: 'Groq',
  openai: 'OpenAI',
  ollama: 'Ollama',
  custom: 'Local',
};

export const PROVIDER_DISPLAY = {
  groq: 'Groq',
  openai: 'OpenAI',
  ollama: 'Ollama',
  custom: 'Local models',
};

export const PROVIDER_MODELS = {
  groq: [
    'openai/gpt-oss-120b',
    'openai/gpt-oss-20b',
    'qwen/qwen3.8-27b',
    'minimaxai/minimax-m2.7',
  ],
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo', 'o1-mini'],
  ollama: ['llama3.2', 'llama3.1', 'mistral', 'codellama', 'phi3'],
  custom: [], // filled from the .gguf files the user adds
};

export const PROVIDER_DEFAULT_MODEL = {
  groq: 'openai/gpt-oss-120b',
  openai: 'gpt-4o',
  ollama: 'llama3.2',
  custom: '',
};

export function detectProviderFromKey(key) {
  if (key.startsWith('gsk_')) return 'groq';
  if (key.startsWith('sk-')) return 'openai';
  if (key.startsWith('http://') || key.startsWith('https://') || key.startsWith('localhost')) return 'ollama';
    return null;
}

export const PROVIDER_ENDPOINTS = {
  groq: 'https://api.groq.com/openai/v1/chat/completions',
  openai: 'https://api.openai.com/v1/chat/completions',
  // Ollama's OpenAI-compatible endpoint: same streaming and tool format as the other providers
  ollama: 'http://localhost:11434/v1/chat/completions',
  // Local .gguf models run by llama-server; the real port is chosen when the model starts
  custom: 'http://127.0.0.1:8089/v1/chat/completions',
};

// The chat endpoint for a key. An Ollama or local-model key can be a URL (the server address).
export function getEndpoint(key) {
  if (key && (key.provider === 'ollama' || key.provider === 'custom') && /^https?:\/\//i.test(key.key || '')) {
    const base = key.key.trim().replace(/\/+$/, '').replace(/\/(v1|api)(\/.*)?$/, '');
    return `${base}/v1/chat/completions`;
  }
  return PROVIDER_ENDPOINTS[key.provider];
}
