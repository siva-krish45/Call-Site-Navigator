# Call Site Navigator

Jump back to the **exact call site** after a Go to Definition — instantly, no matter how much you scrolled or clicked in between.

## Why

VS Code's built-in **Navigate Back** (`Alt+←`) is polluted by every cursor click you make while reading an implementation. Jump into `findAge()` from line 300, scroll around, click a few lines — and `Alt+←` drops you wherever your cursor last landed, not back at line 300 where you started.

Call Site Navigator remembers the precise spot you jumped *from* and takes you straight back there with one key.

## How to use

1. Navigate to a definition the way you already do — **`F12`** or **`Ctrl+Click`**.
2. Press **`Alt+Q`** to jump straight back to the exact call site.
3. Press **`Alt+Q`** again right away to bounce back to the definition (handy for comparing the two).

That's it. It works for definitions in the same file and across files.

## Features

- **Exact return** — lands on the precise line and symbol you jumped from, not your last cursor position.
- **Quick toggle** — flip back and forth between the call site and the definition.
- **Edit-aware** — if you edit the file while you're away, it re-finds the original symbol instead of landing on the wrong line.
- **Per-file history** — keeps separate navigation history for each file you read.
- **Lightweight** — no configuration required; stays out of your way.

## Keybindings

| Action | Shortcut |
|--------|----------|
| Go to Definition (tracked) | `F12` |
| Jump back to call site | `Alt+Q` |

Both can be changed in **Keyboard Shortcuts** (`Ctrl+K Ctrl+S`) — search for "Call Site Navigator".

## Requirements

A language extension for your language (TypeScript, Pylance, rust-analyzer, etc.) must be installed — Call Site Navigator uses your editor's existing Go to Definition.

## Tip: if Ctrl+Click opens a "peek" instead of navigating

Some languages show an inline peek when a symbol has more than one definition. To make Ctrl+Click always jump (so it can be tracked), set this in your settings:

```json
"editor.gotoLocation.multipleDefinitions": "goto"
```

## License

[MIT](LICENSE)
