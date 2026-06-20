import * as vscode from 'vscode';
import { evictDocument, pushCallSite } from './store';
import { jumpState } from './jumpState';
import { captureGuard } from './captureGuard';
import { pendingState } from './pending';
import { log } from './log';
import { CallSite } from './types';

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

// When true, logs EVERY selection event (verbose diagnostic).
// Off by default; toggle via the "Call Site Navigator: Toggle Diagnostics" command.
let diagnosticRaw = true;

export function setDiagnosticRaw(on: boolean): void {
    diagnosticRaw = on;
    log.info(`Raw diagnostic logging ${on ? 'ENABLED' : 'disabled'}`);
}

const JUMP_MIN_LINES = 3;     // same-file move this big counts as a navigation
const PENDING_TTL_MS = 4000;  // provider call site is valid this long
const FALLBACK_TTL_MS = 4000; // cursor fallback freshness
// A same-file Ctrl+Click is a click IMMEDIATELY followed by an automatic jump to
// the definition — the two cursor events land within a few dozen ms of each other.
// Deliberate browsing clicks are spaced far further apart (human reaction time).
// We only treat a cursor-sourced same-file move as a navigation when it happened
// within this window after the preceding cursor event. This is the signal that
// separates "go to definition" from "I clicked somewhere" without a provider.
const SAME_FILE_NAV_WINDOW_MS = 300;

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
}

export function primeNavigationTracking(): void {
    const editor = vscode.window.activeTextEditor;
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
    log.info(`Navigation tracking primed — word: ${lastPos?.token || '(none)'}`);
}

function recordCallSite(cs: Pos, defLine: number, via: string): void {
    const callSite: CallSite = {
        uri:         cs.uri,
        line:        cs.line,
        character:   cs.character,
        token:       cs.token,
    };
    pushCallSite(callSite);
    log.info(`[${via}] Call site registered: "${cs.token}" line:${cs.line} (jumped to line:${defLine})`);
}

/**
 * Attempt to record a call-site given where we just landed.
 * Call-site source priority:
 *   1. pendingState (DefinitionProvider) — exact position VS Code resolved.
 *   2. lastPos — the cursor position right before this event.
 * A call site is only recorded if the landing is in the same file and is a genuine move
 * (>= JUMP_MIN_LINES away).
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
    if (pending && (now - pending.at) <= PENDING_TTL_MS && pending.uri.scheme === 'file') {
        cs = { ...pending };
        source = 'provider';
    } else if (lastPos && lastPos.token && (now - lastPos.at) <= FALLBACK_TTL_MS && lastPos.uri.scheme === 'file') {
        cs = lastPos;
        source = 'cursor';
    }
    if (!cs) {
        if (diagnosticRaw) log.info(`[cap] reject(${via}): no call-site source (pending=${pending ? 'stale' : 'none'}, lastPos=${lastPos ? `${lastPos.token || 'no-token'}@${now - lastPos.at}ms` : 'none'})`);
        return false;
    }

    const fileChanged = cs.uri.toString() !== landingUri.toString();
    if (fileChanged) {
        if (diagnosticRaw) log.info(`[cap] reject(${via}): cross-file jump ignored`);
        return false;
    }

    const delta = Math.abs(cs.line - landingLine);
    const dt = now - cs.at;
    if (diagnosticRaw) log.info(`[cap] try(${via}): src=${source} delta=${delta} dt=${dt}ms tok="${cs.token}"`);

    if (delta < JUMP_MIN_LINES) {
        if (diagnosticRaw) log.info(`[cap] reject: same-file move too small (delta=${delta} < ${JUMP_MIN_LINES})`);
        return false;
    }
    if (source !== 'provider' && dt > SAME_FILE_NAV_WINDOW_MS) {
        if (diagnosticRaw) log.info(`[cap] reject: same-file click too slow to be auto-jump (dt=${dt}ms > ${SAME_FILE_NAV_WINDOW_MS}ms) — looks like browsing, not go-to-def`);
        return false;
    }

    recordCallSite(cs, landingLine, `${via}/${source}`);
    pendingState.callSite = null; // consumed
    return true;
}

/**
 * PRIMARY capture path: a Go-to-Definition moves the cursor, which surfaces here.
 * Works for same-file. Skips Keyboard-kind moves (typing/arrows).
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
        const pos = e.selections[0].active;
        const kind = e.kind;

        // Diagnostic: log meaningful moves (>= JUMP_MIN_LINES).
        if (diagnosticRaw && lastPos) {
            const fileChanged = lastPos.uri.toString() !== uri.toString();
            const delta = Math.abs(lastPos.line - pos.line);
            if (!fileChanged && delta >= JUMP_MIN_LINES) {
                const pend = pendingState.callSite;
                log.info(`[sel] kind=${kindName(kind)} ${lastPos.line}→${pos.line}  pending=${pend ? `"${pend.token}"` : 'none'}`);
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
    });
}

export function createDocumentCloseListener(): vscode.Disposable {
    return vscode.workspace.onDidCloseTextDocument((doc) => {
        evictDocument(doc.uri.toString());
    });
}
