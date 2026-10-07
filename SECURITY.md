# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for a security problem. Use GitHub's private reporting instead: go to the repository's **Security** tab and choose **Report a vulnerability**. Include what you found, how to reproduce it, and what you think the impact is. You will get an answer as soon as possible.

Selene is an early-stage hobby project, so there is no bug bounty, but real reports are taken seriously and credited if you want.

## What you should know about how Selene works

Selene lets an AI model read files, run terminal commands and open web pages on your computer. That is powerful, so these are the safety rules it follows, and the known gaps.

**Protections**
- **Commands need approval by default.** The optional "Auto for read-only" mode only runs plain look-but-don't-touch commands that stay inside the linked project folder (no redirects, no `..`, no secret-looking paths, no `find -exec`). "Always allow" turns approval off completely and is the user's choice.
- **Web content is untrusted.** The built-in prompts tell the model to treat web pages, search results and files as information, not instructions.
- **Model output is escaped.** Replies are shown as text, never as HTML, and only `http(s)` and `mailto` links are clickable.
- **The page reader blocks local and private network addresses**, so a web page cannot make Selene probe your network.

**Known gaps**
- API keys, chats and memory are stored **unencrypted** in the app's data folder and browser storage.
- The app's content security policy is **disabled** (`"csp": null` in `src-tauri/tauri.conf.json`). Turning it on is on the roadmap.
- The shell permission in `src-tauri/capabilities/default.json` allows running any `sh -c` command from the app window. The approval flow in the app is what limits it, so any bug that lets untrusted content run script in the app window would be serious. That is why message rendering is escaped.
- Local models are run with `llama-server`, which Selene downloads from the official llama.cpp GitHub releases. The download is not signature-checked yet.
- Prompt injection can never be fully prevented. Keep command approval on when you let Selene read web pages or untrusted files.

## Supported versions

Only the latest release and the `main` branch get fixes.
