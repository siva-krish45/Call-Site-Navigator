# Call Site Navigator VS Code Extension

Jump back to the **exact call site** after a "Go to Definition" — instantly, no matter how much you scroll, click, or edit in between.

---

## 💡 Why Call Site Navigator?

### The Problem
VS Code's built-in **Navigate Back** (`Alt+←` or `Cmd + [`) is polluted by every cursor click you make. If you jump to `findAge()` from line 30, scroll around to understand it, and click a few lines in the implementation, pressing `Alt+←` drops you at your last click inside the implementation, not back at line 30.

### The Solution
**Call Site Navigator** keeps a dedicated LIFO stack of navigations, completely ignoring reading clicks and scroll movements. When you press **`Alt+Q`**, you immediately jump back to the exact call site.

---

## 🚀 Key Features

* **Zero Performance Overhead**: The extension is completely passive. It registers no active observers during typing, scroll-clicks, or editing, ensuring absolute lag-free performance even in massive codebases.
* **Fuzzy Re-anchoring**: If you edit code near the call site or definition, line numbers shift. The extension automatically scans nearby lines (`±50` lines) for the symbol name to re-anchor the cursor on the correct line.
* **LIFO Stack Jumps**: Easily walk back through nested definitions (e.g. `1` → `100` → `150` walks back `150` → `100` → `1`).
* **Empty-Stack Toggle Forward**: When the stack is empty (e.g., you popped back to the call site), pressing `Alt+Q` again toggles you forward to the definition you just left. This target is persistent, meaning you can code at the call site for 10 minutes and still toggle back to the definition instantly.

---

## 📖 Walkthrough Examples

### Example 1: Nested Navigation Stack (LIFO)
1. You are at `line 10` and `Ctrl+Click` a helper function defined at `line 100`.
2. While reading the helper at `line 100`, you `Ctrl+Click` another function defined at `line 200`.
3. Press **`Alt+Q`** to return to `line 100`.
4. Press **`Alt+Q`** again to return to `line 10`.

### Example 2: Persistent Toggle Forward
1. You are at `line 5` and `Ctrl+Click` a method at `line 80`.
2. Press **`Alt+Q`** to return to `line 5`.
3. You stay at `line 5` and spend 10 minutes writing code and editing the file.
4. Press **`Alt+Q`** again. You are immediately toggled back to `line 80` (with fuzzy anchoring adjusting for any line drift caused by your edits).
5. Press **`Alt+Q`** again. You return to `line 5`.

---

## ⌨️ Keybindings

| Command | Action | Shortcut |
|---|---|---|
| `callSiteNav.goToDefinition` | Go to Definition (tracked) | `F12` |
| `callSiteNav.jumpBack` | Jump back / Toggle definition | `Alt+Q` |

> 💡 Both shortcuts can be customized in VS Code's **Keyboard Shortcuts** (`Ctrl+K Ctrl+S`) by searching for `Call Site Navigator`.

---

## 🛠️ Requirements

A language extension (e.g. TypeScript/JavaScript Language Features, Pylance, rust-analyzer, etc.) must be active for your files. Call Site Navigator integrates with your editor's existing Go to Definition providers.

## 🤝 License

[MIT](LICENSE)
