# Selene

A desktop AI chat app that can work with your files, your terminal and the web, and can run models on your own computer. Built with Tauri 2, React and Rust.

![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)
![Status: early development](https://img.shields.io/badge/status-early%20development-orange.svg)
![Platform: Linux](https://img.shields.io/badge/platform-Linux-lightgrey.svg)

<!-- Add a screenshot here: put it in docs/screenshot.png and uncomment the next line -->
<!-- ![Selene](docs/screenshot.png) -->

> **Status:** early development (v0.1). It works for daily use on Linux, but expect rough edges. There is no automated test suite yet.

## What it does

**Chat**
- Multiple chats, chat search, and projects that group chats and link a folder on your computer.
- Streaming replies, Markdown with code highlighting, message edit / delete / regenerate, and Markdown export.
- Thinking levels (Off, Light, Normal, Deep) with a collapsible "Thought process" block.

**Models**
- **Cloud:** Groq and OpenAI, with several API keys and automatic rotation when one hits a rate limit.
- **Local, no extra software to install by hand:** pick a `.gguf` file and Selene runs it itself with [llama.cpp](https://github.com/ggml-org/llama.cpp). Selene can download and set up llama.cpp for you, and has a built-in browser to search and install models from Hugging Face (with resumable downloads).
- **Ollama:** optional, if you already use it.

**Tools Selene can use**
- Web search (no API key, no Docker) and reading web pages.
- Running terminal commands, with three approval modes: ask every time (default), auto for read-only commands inside the project folder, or always allow.
- Reading and writing files in a linked project folder.
- Long-term memory (you control it and can turn it off), a to-do list shown in a side panel, and helper agents that work in parallel.

**Control and cost**
- **Prompts tab:** every prompt Selene sends can be read, edited and reset.
- **Prompt Upgrader:** rewrites your message before sending (Light, Balanced or Detailed).
- **AI Boosts:** token savers such as history trimming, tool output limits, reply length, and automatic waiting on rate limits.

## Requirements

- **Linux.** Developed on EndeavourOS (Arch). Other distros should work; see below. Windows and macOS are not supported yet (Selene runs commands through `sh`, and the llama.cpp auto-install targets Linux x86_64).
- [Node.js](https://nodejs.org/) 20 or newer
- [Rust](https://rustup.rs/) (stable)
- The system libraries Tauri needs. The setup script installs them for you.

## Quick start

```bash
git clone https://github.com/YOUR-USERNAME/selene.git
cd selene

# Optional: installs system libraries, Rust and the npm packages (Arch, Debian/Ubuntu, Fedora)
bash install-tauri.sh

# Run the app (the first build takes a few minutes)
npm run tauri dev
```

To install the system libraries yourself, follow the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/#linux) for your distro, then run `npm install`.

### Build a release

```bash
npm run tauri build
```

The packages (`.deb`, `.rpm`, `.AppImage`) appear in `src-tauri/target/release/bundle/`.

## First run

1. Open **Settings, API Config** and add an API key. [Groq](https://console.groq.com/) has a free tier. Or skip keys and use a local model (see below).
2. Pick a model from the menu at the top.
3. Start chatting. To work with code, create a **project**, link a folder to it, and chat inside that project.

## Running models on your computer

1. Open **Settings, Local models, Find & install**.
2. Search for a chat model (for example "qwen3" or "llama") and install a `Q4_K_M` file. Pick a size that fits your GPU memory (the file size is roughly the memory it needs).
3. Choose it in the model menu and send a message. The first time, Selene downloads and sets up llama.cpp by itself (a Vulkan GPU build, with an automatic fallback to a CPU build). Nothing needs an admin password.

You can also add a `.gguf` file you already have with **+ Add model file**. Models are stored in `~/Documents/SeleneModels` by default, and idle models are unloaded from memory automatically.

## Privacy and security

- Chats, settings and API keys are stored **on your computer** in the app's data folder and browser storage. **API keys are not encrypted.** Do not share the data folder.
- Your messages go to the provider you choose (Groq, OpenAI), or stay on your computer when you use a local model. If memory is on, the saved facts are sent with every request.
- **Commands need your approval by default.** "Auto for read-only" only runs look-but-don't-touch commands (`ls`, `cat`, `grep`, `git status`, ...) that stay inside the project folder and avoid secret-looking paths. "Always allow" lets the AI run anything: use it only if you accept the risk.
- Text from web pages and files is treated as information, not instructions, and model replies are shown as plain text (never as HTML). The page reader refuses to open local and private network addresses.
- Known limitation: the app's content security policy is currently disabled. See [SECURITY.md](SECURITY.md).

## Project layout

```
src/                  React app
  App.js              main state, chat and tool loop
  prompts.js          every prompt Selene sends (editable in Settings)
  tools.js            tool definitions and execution
  localmodels.js      runs .gguf models through llama-server
  llamainstall.js     downloads and sets up llama.cpp
  modeldownload.js    Hugging Face search and resumable downloads
  components/         UI
src-tauri/            Rust backend (files, web search, page reader) and permissions
docs/                 architecture notes
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the pieces fit together.

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) first. Security issues: see [SECURITY.md](SECURITY.md).

## Roadmap

- Safer storage for API keys (system keychain)
- A content security policy
- Splitting `App.js` into smaller modules, and an automated test suite
- Smarter rules for splitting work between helper agents
- Windows and macOS support

## License

[MIT](LICENSE)
