# Architecture

A short tour of how Selene fits together. For setup, see the [README](../README.md).

## Stack

- **Tauri 2** (Rust) wraps a **React 19** app built with **Vite** and **Tailwind CSS v4**.
- Tauri plugins: dialog, shell, store, opener.
- No backend server. Everything runs on the user's computer.

## Source map

```
src/
  App.js               State, settings, streaming, the tool loop, system prompt assembly
  prompts.js           Every prompt Selene sends, with defaults (editable in Settings, Prompts)
  tools.js             Tool definitions (what the AI sees) and tool execution
  agents.js            Helper agents that run in parallel (web search and reading only)
  thinking.js          Splits <think> reasoning from the answer
  types.js             Providers, default models, endpoints (getEndpoint)
  store.js             Persistence: browser storage plus the Tauri store, with a cache
  localmodels.js       Hook that runs .gguf models through llama-server
  llamainstall.js      Downloads and sets up llama.cpp (Vulkan or CPU build)
  modeldownload.js     Hugging Face search and resumable model downloads (curl)
  ollama.js            Optional Ollama helpers
  components/          UI (sidebar, chat, settings panels, model browser, ...)
src-tauri/
  src/lib.rs           Rust commands: file tree / read / write, search_web, fetch_url
  capabilities/        Tauri permissions (what the web part may do)
```

## How a message flows

1. The user sends a message. The optional **Prompt Upgrader** can rewrite it first.
2. `streamResponse` builds the request: the system prompt (`buildSystemPrompt`, from `prompts.js`, with the project folder tree, memory, thinking and style parts), the trimmed chat history, and the enabled tools.
3. `doFetchAndStream` sends it to the provider and streams the reply. Every provider uses the OpenAI-style chat completions format, including local models (`llama-server`) and Ollama (its `/v1` endpoint).
4. If the model asks for **tools**, they run and the results go back to the model, in a loop:
   - `run_command` goes through the approval flow (ask / auto for read-only / always)
   - `web_search` and `read_url` call Rust commands
   - `save_memory` / `forget_memory`, `update_todos` and `delegate_to_agents` are handled in `App.js`
5. In the reply, `[read:path]` markers are replaced with file contents, and code blocks labelled with a file path are saved into the project folder.

## Providers and keys

`types.js` lists the providers (Groq, OpenAI, Ollama, and `custom` for local `.gguf` models). Several keys per provider can be added; when one hits a rate limit or is invalid, Selene rotates to the next. Local model connections use a URL instead of a key.

## Local models

`localmodels.js` starts `llama-server` (llama.cpp) with the chosen `.gguf` file on a free port starting at 8089, waits for it to be ready, and stops it when idle or on request. If `llama-server` is not found, `llamainstall.js` downloads the official Linux build from the llama.cpp GitHub releases into `~/.local/share/luna/llama.cpp`. `modeldownload.js` provides the Hugging Face browser and resumable downloads into `~/Documents/SeleneModels`.

## Persistence

`store.js` keeps a synchronous cache that is filled at startup from browser storage and the Tauri store, so React state can start with real data.

**Only keys listed in `LUNA_KEYS` are loaded at startup.** A new saved setting must be added there.

Saved keys: `luna-chats`, `luna-messages`, `luna-apikeys`, `luna-activekey`, `luna-sidebar`, `luna-custom-prompt`, `luna-projects`, `luna-searxng-url`, `luna-prompt-system-enabled`, `luna-prompt-upgrader-enabled`, `luna-boosts`, `luna-memory`, `luna-todos`, `luna-prompts`, `luna-custom-models`, `luna-llama-settings`, `luna-theme`.

`App.js` saves changes with a short delay, and does not save chat messages while a reply is streaming (it saves once when the reply ends).

## Security notes

See [SECURITY.md](../SECURITY.md). The short version: commands need approval, web content is untrusted, model output is escaped, and API keys are stored unencrypted.

## Known weak spots

- `App.js` is very large and should be split into smaller modules.
- There are no automated tests.
- The content security policy is disabled.
- Linux only: commands run through `sh`, and the llama.cpp auto-install targets Linux x86_64.
