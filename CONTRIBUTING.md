# Contributing to Selene

Thanks for helping! Selene is a small project in early development, so contributions of every size are welcome: bug reports, ideas, docs and code.

## Before you start

- For anything bigger than a small fix, **open an issue first** so we can agree on the idea before you spend time on it.
- Look at [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) to see how the app fits together.

## Running it

```bash
bash install-tauri.sh     # system libraries, Rust and npm packages (Arch, Debian/Ubuntu, Fedora)
npm run tauri dev         # the first build takes a few minutes
```

Only the web part, in a browser (no file access, commands or local models): `npm run dev`.

## Before you open a pull request

There is no automated test suite yet, so please test by hand and say what you tested in the PR.

```bash
npm run build                                   # the frontend must build
cargo check --manifest-path src-tauri/Cargo.toml  # the Rust side must compile
```

CI runs both of these on every pull request.

## Things that are easy to get wrong

- **A new saved setting must be added to the key list in `src/store.js` (`LUNA_KEYS`).** If it is missing, it works while the app is open but is forgotten after a restart.
- **Prompts live in `src/prompts.js`.** Do not hard-code prompt text in other files. Keep what the app's own code depends on: the code-block label that is a file path, the `[read:path]` marker, the `<think></think>` tags and the `{{...}}` fill-in spots.
- **Tools** are defined in `src/tools.js`. A tool that runs something on the user's computer must go through the approval flow in `App.js`.
- **Permissions:** the Tauri shell permissions are in `src-tauri/capabilities/default.json`. Keep them as narrow as you can and explain any change in the PR.
- **Never render model output as HTML.** Messages are escaped in `src/components/Message.js` on purpose, because web pages the AI reads could try to inject code.
- **No secrets in the repo.** Do not commit API keys, `.env` files or downloaded models.

## Style

- Plain, readable code and simple comments that explain *why*.
- Match the style of the file you are editing.
- Keep changes focused: one idea per pull request.

## Reporting bugs

Use the bug report template. Include your distro, what you clicked, and any error text shown in the app or in the terminal running `npm run tauri dev`. Security problems: see [SECURITY.md](SECURITY.md) instead of opening a public issue.
