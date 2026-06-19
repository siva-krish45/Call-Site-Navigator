# Call Site Navigator

A VS Code extension that tracks exactly which call site you jumped from when using Go to Definition, then lets you return to it instantly — bypassing VS Code's global navigation stack entirely.

## The Problem

VS Code's native `Alt+Left` (Navigate Back) is polluted by every cursor click you make while reading a function's implementation. If you jump to `findAge()` from line 300, then scroll around the implementation, `Alt+Left` may take you back to line 347 — wherever your last cursor click was — not to line 300 where you started.

## The Solution

This extension maintains a strict, atomic bookmark pairing:

```
call site (line 300 in caller.ts)  ←→  definition (line 42 in utils.ts)
```

One hotkey. Instant return. No matter how much you scroll or click in between.

---

## Features

- **Deterministic capture** — intercepts Go to Definition at the provider level, not via heuristic selection listeners
- **Native stack isolation** — uses `showTextDocument` + direct selection mutation; never touches `editor.action.revealDefinition`
- **Hybrid toggle** — first press jumps back to call site; second press (if no other action) bounces you back to the definition
- **Fuzzy re-anchoring** — if you edit the file while away, the extension searches ±50 lines for the original token rather than landing on a wrong line
- **Per-document history** — navigation history is scoped to the file you are reading, not a single global stack
- **Cross-file compatible** — reverse index handles split-pane and multi-file definition jumps correctly
- **Same-file compatible** — functions defined and called in the same file are tracked via the call-site stack, not the reverse index
- **Memory-safe** — capped at 50 entries per document; all state evicted when a document is closed

---

## Requirements

- VS Code `1.85.0` or later
- A language server extension installed for your language (TypeScript, Pylance, rust-analyzer, etc.) — this extension delegates definition resolution to your existing LSP

---

## Installation

### From source (development)

```bash
git clone <your-repo-url>
cd call-site-navigator
npm install
npm run compile
```

Then press `F5` in VS Code to open the Extension Development Host.

### Before you do anything — set your publisher ID

Open `package.json` and replace `"your-publisher-id"` with your actual VS Code Marketplace publisher ID (create one at https://marketplace.visualstudio.com/manage). Then update the matching line in `test/integration/jumpBack.integration.test.ts`:

```typescript
await vscode.extensions.getExtension('YOUR-PUBLISHER-ID.call-site-navigator')?.activate();
```

If these two values don't match, integration tests will find 0 tests passing.

### Packaging for local install

```bash
npm install -g @vscode/vsce
vsce package
# produces call-site-navigator-0.1.0.vsix
code --install-extension call-site-navigator-0.1.0.vsix
```

---

## Usage

### Step 1 — Jump to a definition

Use your existing Go to Definition workflow:
- `Ctrl+Click` on a function call
- `F12` (if you rebind it — see note below)

The extension intercepts the definition provider chain and records the exact call site before navigation happens.

### Step 2 — Jump back

Press `Ctrl+Alt+[` (Mac: `Cmd+Alt+[`) from anywhere inside the definition.

You land back at the exact call site line, re-anchored if the file was edited while you were away.

### Step 3 — Toggle (optional)

Press `Ctrl+Alt+[` again **immediately** (before typing or moving the cursor more than 2 lines) to bounce back to the definition.

The toggle window closes if:
- You type or delete anything in the file
- You move the cursor more than 2 lines from the call site

### Rebinding the hotkey

Open `keybindings.json` (`Ctrl+Shift+P` → "Open Keyboard Shortcuts (JSON)"):

```json
{
  "key": "ctrl+alt+[",
  "command": "callSiteNav.jumpBack",
  "when": "editorTextFocus"
}
```

Change `"key"` to any binding you prefer.

---

## Architecture

```
src/
├── types.ts        # CallSitePair — the atomic unit of navigation state
├── store.ts        # Per-document stacks + reverse definition index
├── anchor.ts       # Fuzzy token re-anchoring (±50-line spiral search)
├── jumpState.ts    # CJS-safe shared flag for jump execution guard
├── provider.ts     # DefinitionProvider wrapper — captures call site, yields to LSP
├── jumpBack.ts     # Jump-back command — toggle logic, revealAt via showTextDocument
├── listeners.ts    # Selection, document change, and document close event handlers
└── extension.ts    # Activation — wires all subscriptions
```

### How the provider wrapper works

```
User Ctrl+Clicks  →  VS Code calls all DefinitionProviders
                          │
                          ├─ Our provider:
                          │    1. Sets isResolving = true
                          │    2. Calls executeDefinitionProvider (inner)
                          │         └─ Our provider sees isResolving=true → returns null
                          │         └─ Native LSP → returns [Location]
                          │    3. Checks: cancelled? → bail. results.length ≠ 1? → bail.
                          │    4. Records CallSitePair in store
                          │    5. Returns null  ← yields; does NOT navigate
                          │
                          └─ Native LSP: returns Location → VS Code navigates there
```

### Data structures

```typescript
// Primary index — LIFO per call-site document, max depth 50
Map<callSiteUri, CallSitePair[]>

// Reverse index — cross-file lookup when active editor is the definition file
// NOT populated for same-file pairs (avoids URI collision)
Map<definitionUri, CallSitePair>

interface CallSitePair {
    callSiteUri, callSiteLine, callSiteCharacter, callSiteToken,
    definitionUri, definitionLine, definitionCharacter,
    toggleTarget: { uri, line, character } | null
}
```

### Known limitations

| Scenario | Behavior |
|---|---|
| Symbol with multiple definitions (overloads, interface + class) | Not tracked — extension bails out and lets native navigation handle it |
| `F12` key (without rebinding) | Not intercepted — only Ctrl+Click goes through the provider chain |
| Definition in a remote / virtual filesystem | Not supported — only `{ scheme: 'file' }` URIs are tracked |
| State after extension host restart | State is in-memory; lost on reload |

---

## Development

### Project structure

```
call-site-navigator/
├── src/                          # Extension source
├── test/
│   ├── unit/                     # Pure unit tests (no extension host)
│   │   ├── __mocks__/vscode.ts   # Minimal vscode stub
│   │   ├── anchor.test.ts
│   │   ├── store.test.ts
│   │   └── provider.test.ts
│   ├── integration/              # Full VS Code host tests
│   │   └── jumpBack.integration.test.ts
│   └── fixtures/
│       └── sample-project/       # TypeScript workspace used by integration tests
├── tsconfig.json                 # Main tsconfig (compile + integration tests)
├── tsconfig.unit.json            # Unit test tsconfig (maps vscode → mock)
└── .vscode-test.mjs              # Integration test runner config
```

### Scripts

| Command | What it does |
|---|---|
| `npm run compile` | Compile TypeScript to `./out` |
| `npm run watch` | Compile in watch mode |
| `npm run test:unit` | Run 29 pure unit tests via Mocha (no VS Code needed) |
| `npm run test:integration` | Run integration tests in a real VS Code instance |
| `npm test` | Run unit tests then integration tests |

### Running unit tests

No VS Code installation required — runs in plain Node via ts-node:

```bash
npm run test:unit
```

Expected output: 29 tests passing across `anchor`, `store`, and `provider` suites.

### Running integration tests

Requires VS Code to be installed. The test runner downloads a headless VS Code instance automatically on first run:

```bash
npm run test:integration
```

This opens the `test/fixtures/sample-project` workspace and runs the full `jumpBack.integration.test.ts` suite, covering:
- First press jump-back
- Toggle second press
- Native navigation stack isolation
- Toggle target clearing on mutation
- Toggle target clearing on cursor drift
- Fuzzy re-anchoring with shifted line numbers

### Debugging in the Extension Development Host

1. Open this folder in VS Code
2. Press `F5`
3. A new VS Code window opens with the extension loaded
4. Open any TypeScript/JavaScript project
5. Ctrl+Click a function call
6. Press `Ctrl+Alt+[` to jump back

Set breakpoints in `src/provider.ts` or `src/jumpBack.ts` to step through the logic.

---

## Contributing

### Adding a new edge case test

Unit tests live in `test/unit/`. They use plain Mocha with a minimal `vscode` stub — no extension host needed. The stub is at `test/unit/__mocks__/vscode.ts`; extend it if your test needs additional VS Code API surface.

Integration tests live in `test/integration/`. They require a real extension host and run against the fixture project in `test/fixtures/sample-project/`.

### Changing the language selector

By default the extension registers its DefinitionProvider for all files with `scheme: 'file'`. To restrict to specific languages, update `src/extension.ts`:

```typescript
// Restrict to TypeScript and JavaScript only
vscode.languages.registerDefinitionProvider(
    [
        { scheme: 'file', language: 'typescript' },
        { scheme: 'file', language: 'javascript' },
        { scheme: 'file', language: 'typescriptreact' },
        { scheme: 'file', language: 'javascriptreact' },
    ],
    createDefinitionProvider()
)
```

### Changing stack depth

Edit the constant in `src/store.ts`:

```typescript
const MAX_STACK_DEPTH = 50; // increase or decrease as needed
```

### Changing the re-anchoring radius

Edit the default parameter in `src/anchor.ts`:

```typescript
export function reAnchorToken(
    document: vscode.TextDocument,
    nominalLine: number,
    token: string,
    radius = 50   // ← change this
): number {
```

---

## License

MIT
