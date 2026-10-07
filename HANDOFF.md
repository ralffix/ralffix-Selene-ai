# Luna AI: project handoff

Written at the end of a very long chat so a fresh chat can continue without re-reading everything.

## The user
- Ralfs, self-taught developer and maker. Writes casual English with typos: keep answers simple and direct.
- Wants things **implemented in the files**, not just explained. Cares a lot about token usage (this is why the handoff exists).

## Where everything is
- Project: `/home/ralffix/Documents/OP ai systems/OP ai system`
- Machine: new PC running EndeavourOS (Arch). The old setup was Linux Mint.
- IDE: **never confirmed.** A `.vscode` folder exists in the project, so probably VS Code. Ask if it matters.
- Run it: `npm run tauri dev` in the project folder. First build after Rust changes takes a few minutes.
- Claude can edit files through the **Filesystem connector**, which only has access to `/home/ralffix/Documents`. In a new chat, enable it and load the tools (`read_text_file`, `edit_file`, `write_file`, `list_directory`).
- Other folders in Documents: GitHub, Minecraft mods, Obsidian Vault. Another project, "OP ai systems/design.html" and "promt.txt", sits next to the app folder.

## What Luna is
A desktop AI chat app (Claude-style UI) the user is building. Stack: **Tauri 2 + React (Vite) + Tailwind v4**, Rust backend in `src-tauri/src/lib.rs`. Plugins: dialog, fs, opener, shell, store. Providers (in `src/types.js`): Groq, OpenAI, Ollama. Default model: `openai/gpt-oss-120b` on Groq (free tier, hits rate limits easily).

## File map (`src/`)
- `App.js` (about 1750 lines, the heart): state, settings, streaming, tool loop, system prompt, memory, thinking, agents.
- `tools.js`: tool definitions and execution (run_command, web_search, read_url, save_memory, forget_memory, delegate_to_agents).
- `thinking.js`: splits `<think>` reasoning from the answer.
- `agents.js`: runs helper agents in parallel.
- `store.js`, `types.js`, `setup-searxng.js` (old Docker path, no longer needed).
- `components/`: `Sidebar.js` (new Claude-style; `Sidebar.backup.txt` is the old one), `ChatArea`, `Message` (ThinkingBlock, ToolCallItem), `InputBox` (Think button), `SettingsModal` (tabs incl. AI Boosts and Memory), `AgentPanel`, `ProjectFiles.jsx`, `ApiModal`, `ModelDropdown`, `Header`, `PromptUpgradeModal`, `icons`.
- Rust commands in `lib.rs`: file tree/read/write, **`search_web`** (DuckDuckGo HTML via reqwest + scraper, no Docker), **`fetch_url`** (blocks localhost and private addresses). Cargo deps added: reqwest (rustls), scraper, url.

## What was built in the long chat
1. **Web search with no Docker** (Rust commands above; `tools.js` calls them with `invoke`).
2. **Fixed the tool loop**: tool results were not reaching the model and the follow-up answer had nowhere to appear.
3. **CSS fix**: a global `* {margin:0;padding:0}` was overriding all Tailwind v4 spacing. Removed. Dark `color-scheme` and dropdown option styles added.
4. **Token savers** (Settings, AI Boosts): history trimming, history size, tool output cap (6000 chars), file read limit, auto-wait on 429 rate limits, per-tool on/off switches, reply length, creativity, response style. All stored in one `boosts` object (key `luna-boosts`, defaults in `DEFAULT_BOOSTS` in `App.js`). "Prompt System" switch now really gates the custom prompt.
5. **Custom dropdowns** (`BoostSelect`) because native selects showed white on Linux.
6. **Sidebar rewritten** Claude-style: New chat, Search, Chats (Recents), Projects (list, then inside a project), hover menu per chat (rename, add to project, delete), account menu at the bottom.
7. **Memory**: Settings, Memory tab. Switches: use memory, let Luna save memories. `save_memory` and `forget_memory` tools, secret filter, key `luna-memory`. Memory text is sent to the provider with every request.
8. **Folder awareness**: system prompt always says a project folder is connected (even if the listing fails), no caching, listing capped at 4000 chars. The chat must be **inside the project** for the folder to apply.
9. **Thinking**: `<think>` tags, collapsible "Thought process" block, levels Off/Light/Normal/Deep (setting and a Think button by the send box). Reasoning models (gpt-oss, Qwen3, DeepSeek) are handled natively. Reasoning is stripped from history, file parsing and exports.
10. **Helper agents**: Settings, AI Boosts, Helper agents (off by default, max 2 to 8, report length). Luna calls `delegate_to_agents`, picks how many agents she needs, they run in parallel (web search/read only, never commands or file changes), live `AgentPanel` above the input, results merged by Luna.

## Settings storage keys
`luna-chats, luna-messages, luna-apikeys, luna-activekey, luna-sidebar, luna-custom-prompt, luna-projects, luna-searxng-url, luna-prompt-system-enabled, luna-prompt-upgrader-enabled, luna-boosts, luna-memory, luna-theme`

## Open items and ideas
- **Agents rule not applied yet:** agents should not split tightly connected work (one web page into HTML/CSS/JS), because they cannot see each other's names (IDs, classes, functions). Idea: tell Luna to define shared names first, or have one agent write and the others review. The user tested agents on a to-do page, result unconfirmed.
- Reword the SearXNG section in API Config (still mentions Docker).
- Optional: Agents button next to the Think button; small "folder connected" label near the message box.
- Deleting a chat or project has no confirmation.
- "Recents" is sorted by creation time (chat timestamps are not updated on new messages).
- `Sidebar.backup.txt` can be deleted once the new sidebar is trusted.
- **Token tip for next time:** `App.js` is huge, and rereading it burns tokens. Consider splitting it (boosts/memory/thinking/agents helpers into their own files) before adding more features, and read only the part being changed.
- Nothing has a test suite. Changes were made by editing files directly and the user runs the app to check. Compile errors from `npm run tauri dev` should be pasted back.

## Working style that worked
Read the file first, make exact small edits, explain in plain words, say clearly what is untested, and list any follow-up that is optional.
