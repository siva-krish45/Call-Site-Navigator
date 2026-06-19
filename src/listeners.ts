import * as vscode from 'vscode';
import { getActivePair, evictDocument, pushPair } from './store';
import { jumpState } from './jumpState';
import { captureGuard } from './captureGuard';
import { pendingState } from './pending';
import { log } from './log';
import { CallSitePair } from './types';

interface Pos {
    uri: vscode.Uri;
    line: number;
    character: number;
    token: string;
    at: number;
}

// The cursor position from the immediately preceding selection event (fallback
// call site when the DefinitionProvider did not fire).
let lastPos: Pos | null = null;

// Previous active editor (for cross-file capture). Primed at activation.
let prevActiveEditorUri: string | null = null;

// When true, logs EVERY selection/active-editor event (verbose diagnostic).
// Off by default; toggle via the "Call Site Navigator: Toggle Diagnostics" command.
let diagnosticRaw = false;

export function setDiagnosticRaw(on: boolean): void {
    diagnosticRaw = on;
    log.info(`Raw diagnostic logging ${on ? 'ENABLED' : 'disabled'}`);
}

const JUMP_MIN_LINES = 3;     // same-file move this big counts as a navigation
const PENDING_TTL_MS = 4000;  // provider call site is valid this long
const FALLBACK_TTL_MS = 4000; // cursor fallback freshness

function kindName(k: vscode.TextEditorSelectionChangeKind | undefined): string {
    switch (k) {
        case vscode.TextEditorSelectionChangeKind.Keyboard: return 'Keyboard';
        case vscode.TextEditorSelectionChangeKind.Mouse:    return 'Mouse';
        case vscode.TextEditorSelectionChangeKind.Command:  return 'Command';
        default: return 'undefined';
    }
}

export function _resetNavigationState(): void {
    lastPos = null;
    prevActiveEditorUri = null;
}

export function primeNavigationTracking(): void {
    const editor = vscode.window.activeTextEditor;
    prevActiveEditorUri = editor?.document.uri.toString() ?? null;
    if (editor) {
        const pos = editor.selection.active;
        const wordRange = editor.document.getWordRangeAtPosition(pos);
        lastPos = {
            uri:       editor.document.uri,
            line:      pos.line,
            character: pos.character,
            token:     wordRange ? editor.document.getText(wordRange) : '',
            at:        Date.now(),
        };
    }
    log.info(`Navigation tracking primed — editor: ${prevActiveEditorUri ?? '(none)'}, word: ${lastPos?.token || '(none)'}`);
}

function recordPair(cs: Pos, defUri: vscode.Uri, defLine: number, defChar: number, via: string): void {
    const pair: CallSitePair = {
        callSiteUri:         cs.uri,
        callSiteLine:        cs.line,
        callSiteCharacter:   cs.character,
        callSiteToken:       cs.token,
        definitionUri:       defUri,
        definitionLine:      defLine,
        definitionCharacter: defChar,
        toggleTarget:        null,
    };
    pushPair(pair);
    log.info(`[${via}] Pair: "${cs.token}" ${cs.uri.fsPath}:${cs.line} → ${defUri.fsPath}:${defLine}`);
}

/**
 * Attempt to record a call-site→definition pair given where we just landed.
 * Call-site source priority:
 *   1. pendingState (DefinitionProvider) — exact position VS Code resolved.
 *   2. lastPos — the cursor position right before this event.
 * A pair is only recorded if the landing is a genuine move (different file, or
 * >= JUMP_MIN_LINES away in the same file).
 */
function tryCapture(
    now: number,
    landingUri: vscode.Uri,
    landingLine: number,
    landingChar: number,
    via: string,
): boolean {
    if (jumpState.isExecuting || captureGuard.suppress) return false;
    if (landingUri.scheme !== 'file') return false; // ignore output/debug/peek docs

    let cs: Pos | null = null;
    let source = '';
    const pending = pendingState.callSite;
    if (pending && (now - pending.at) <= PENDING_TTL_MS) {
        cs = { ...pending };
        source = 'provider';
    } else if (lastPos && lastPos.token && (now - lastPos.at) <= FALLBACK_TTL_MS) {
        cs = lastPos;
        source = 'cursor';
    }
    if (!cs) return false;
    if (cs.uri.scheme !== 'file') return false;

    const fileChanged = cs.uri.toString() !== landingUri.toString();
    const delta = Math.abs(cs.line - landingLine);
    if (!fileChanged && delta < JUMP_MIN_LINES) return false;

    recordPair(cs, landingUri, landingLine, landingChar, `${via}/${source}`);
    pendingState.callSite = null; // consumed
    return true;
}

/**
 * PRIMARY capture path: a Go-to-Definition moves the cursor, which surfaces here.
 * Works for same-file and cross-file. Skips Keyboard-kind moves (typing/arrows).
 */
export function createSelectionListener(): vscode.Disposable {
    return vscode.window.onDidChangeTextEditorSelection((e) => {
        if (jumpState.isExecuting) return;

        const uri = e.textEditor.document.uri;

        // RAW DIAGNOSTIC: log every selection change (kind + scheme + location), so
        // we can see definitively what — if anything — your navigation emits.
        if (diagnosticRaw) {
            const base = uri.path.split('/').pop();
            log.info(`[raw-sel] kind=${kindName(e.kind)} scheme=${uri.scheme} ${base}:${e.selections[0].active.line}`);
        }

        if (uri.scheme !== 'file') return; // ignore output channel, debug console, etc.

        const now = Date.now();
        const uriStr = uri.toString();
        const pos = e.selections[0].active;
        const kind = e.kind;

        // Diagnostic: log meaningful moves (file change or >= JUMP_MIN_LINES).
        if (diagnosticRaw && lastPos) {
            const fileChanged = lastPos.uri.toString() !== uriStr;
            const delta = Math.abs(lastPos.line - pos.line);
            if (fileChanged || delta >= JUMP_MIN_LINES) {
                const pend = pendingState.callSite;
                log.info(`[sel] kind=${kindName(kind)} ${fileChanged ? '(file) ' : ''}${lastPos.line}→${pos.line}  pending=${pend ? `"${pend.token}"` : 'none'}`);
            }
        }

        // Capture on any non-typing move. Keyboard moves are excluded so editing
        // and arrow navigation don't fabricate pairs.
        if (kind !== vscode.TextEditorSelectionChangeKind.Keyboard) {
            tryCapture(now, uri, pos.line, pos.character, `sel:${kindName(kind)}`);
        }

        // Update fallback cursor position.
        const wordRange = e.textEditor.document.getWordRangeAtPosition(pos);
        lastPos = {
            uri,
            line:      pos.line,
            character: pos.character,
            token:     wordRange ? e.textEditor.document.getText(wordRange) : '',
            at:        now,
        };

        // Toggle-clear: cursor drifted far from ref line → drop toggleTarget.
        const pair = getActivePair(uriStr);
        if (pair?.toggleTarget) {
            const refLine = uriStr === pair.callSiteUri.toString()
                ? pair.callSiteLine
                : pair.definitionLine;
            if (Math.abs(pos.line - refLine) > 2) {
                pair.toggleTarget = null;
            }
        }
    });
}

/**
 * BACKUP capture for cross-file navigation where the destination's selection
 * event may not surface a usable move.
 */
export function createActiveEditorListener(): vscode.Disposable {
    return vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (diagnosticRaw) {
            const u = editor?.document.uri;
            log.info(`[raw-active] ${u ? `${u.scheme}:${u.path.split('/').pop()}` : '(none)'}`);
        }
        if (!editor) return;
        if (editor.document.uri.scheme !== 'file') return; // ignore output/debug panels

        const prev = prevActiveEditorUri;
        prevActiveEditorUri = editor.document.uri.toString();

        if (jumpState.isExecuting || captureGuard.suppress) return;
        if (prev && prev === editor.document.uri.toString()) return;

        tryCapture(
            Date.now(),
            editor.document.uri,
            editor.selection.active.line,
            editor.selection.active.character,
            'nav',
        );
    });
}

export function createDocumentChangeListener(): vscode.Disposable {
    return vscode.workspace.onDidChangeTextDocument((e) => {
        const uri = e.document.uri.toString();
        const pair = getActivePair(uri);
        if (pair) pair.toggleTarget = null;
    });
}

export function createDocumentCloseListener(): vscode.Disposable {
    return vscode.workspace.onDidCloseTextDocument((doc) => {
        evictDocument(doc.uri.toString());
    });
}
