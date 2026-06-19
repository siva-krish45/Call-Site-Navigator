import * as vscode from 'vscode';
import { pushPair } from './store';
import { pendingState } from './pending';
import { captureGuard } from './captureGuard';
import { CallSitePair } from './types';
import { log } from './log';

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wait for "Go to Definition" to settle, then return the editor we landed on.
 * Polls because language-server resolution + editor focus are async and the
 * active editor is not guaranteed to be updated the instant revealDefinition
 * resolves. We stop early as soon as we detect a real move.
 */
async function waitForNavigation(
    fromUri: string,
    fromLine: number,
): Promise<vscode.TextEditor | undefined> {
    for (let i = 0; i < 20; i++) { // up to ~600ms
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const movedFile = editor.document.uri.toString() !== fromUri;
            const movedLine = Math.abs(editor.selection.active.line - fromLine) >= 3;
            if (movedFile || movedLine) return editor;
        }
        await sleep(30);
    }
    return vscode.window.activeTextEditor;
}

export function createGoToDefinitionCommand(): vscode.Disposable {
    return vscode.commands.registerCommand('callSiteNav.goToDefinition', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            await vscode.commands.executeCommand('editor.action.revealDefinition');
            return;
        }

        // Capture the EXACT call site BEFORE navigating — fully deterministic.
        const pos = editor.selection.active;
        const wordRange = editor.document.getWordRangeAtPosition(pos);
        const callSite = wordRange
            ? {
                  uri:       editor.document.uri,
                  line:      pos.line,
                  character: pos.character,
                  token:     editor.document.getText(wordRange),
              }
            : null;

        log.info(`[F12] pressed on "${callSite?.token ?? '(no word)'}" @ ${editor.document.uri.fsPath}:${pos.line}`);

        // Suppress the active-editor listener so it does not double-capture.
        captureGuard.suppress = true;
        try {
            await vscode.commands.executeCommand('editor.action.revealDefinition');
            const landed = await waitForNavigation(
                callSite?.uri.toString() ?? editor.document.uri.toString(),
                pos.line,
            );

            if (!callSite) {
                log.info(`[F12] no word under cursor — nothing to pair`);
                return;
            }
            if (!landed) {
                log.info(`[F12] navigation produced no active editor`);
                return;
            }

            const landedUri = landed.document.uri.toString();
            const landedLine = landed.selection.active.line;

            const sameSpot =
                landedUri === callSite.uri.toString() &&
                Math.abs(landedLine - callSite.line) < 3;
            if (sameSpot) {
                log.info(`[F12] cursor did not move (no definition found) — no pair`);
                return;
            }

            const pair: CallSitePair = {
                callSiteUri:         callSite.uri,
                callSiteLine:        callSite.line,
                callSiteCharacter:   callSite.character,
                callSiteToken:       callSite.token,
                definitionUri:       landed.document.uri,
                definitionLine:      landedLine,
                definitionCharacter: landed.selection.active.character,
                toggleTarget:        null,
            };
            pushPair(pair);
            log.info(`[F12] Pair recorded: "${callSite.token}" ${callSite.uri.fsPath}:${callSite.line} → ${landed.document.uri.fsPath}:${landedLine}`);
        } finally {
            captureGuard.suppress = false;
            // Clear any pendingState our DefinitionProvider may have set during reveal,
            // so it cannot bleed into a later Ctrl+Click.
            pendingState.callSite = null;
        }
    });
}
