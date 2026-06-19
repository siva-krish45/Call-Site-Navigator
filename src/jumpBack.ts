import * as vscode from 'vscode';
import { findPairLoose, popPair, dumpState } from './store';
import { reAnchorToken } from './anchor';
import { jumpState } from './jumpState';
import { log } from './log';

async function revealAt(uri: vscode.Uri, line: number, character: number): Promise<void> {
    const doc = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(doc, { preserveFocus: false });
    const pos = new vscode.Position(line, character);
    editor.selection = new vscode.Selection(pos, pos);
    // Bypass editor.action.revealDefinition — keeps VS Code's native nav stack clean
    editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
}

export function createJumpBackCommand(): vscode.Disposable {
    return vscode.commands.registerCommand('callSiteNav.jumpBack', async () => {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) return;

        const activeUri = activeEditor.document.uri.toString();
        const pair = findPairLoose(activeUri);
        if (!pair) {
            log.info(`Jump back pressed — no pair found for active file: ${activeUri}`);
            log.info(`--- store state ---\n${dumpState()}\n-------------------`);
            log.show();
            return;
        }

        jumpState.isExecuting = true;
        try {
            const currentLine = activeEditor.selection.active.line;
            // After first press the user lands at the call site — that's when toggleTarget is set.
            // So second-press condition is: near the call site with a toggleTarget waiting.
            const isNearCallSite =
                activeUri === pair.callSiteUri.toString() &&
                Math.abs(currentLine - pair.callSiteLine) <= 2;

            log.info(`Jump back: isNearCallSite=${isNearCallSite} toggleTarget=${!!pair.toggleTarget} activeUri=${activeUri}`);

            if (isNearCallSite && pair.toggleTarget) {
                log.info(`Toggle → back to definition`);
                await revealAt(
                    pair.toggleTarget.uri,
                    pair.toggleTarget.line,
                    pair.toggleTarget.character
                );
                popPair(pair);
            } else {
                log.info(`First press → jumping to call site ${pair.callSiteUri.fsPath}:${pair.callSiteLine}`);
                // First press: record current position as toggle target, jump to call site
                pair.toggleTarget = {
                    uri:       activeEditor.document.uri,
                    line:      currentLine,
                    character: activeEditor.selection.active.character,
                };

                const callDoc = await vscode.workspace.openTextDocument(pair.callSiteUri);
                const anchoredLine = reAnchorToken(callDoc, pair.callSiteLine, pair.callSiteToken);
                await revealAt(pair.callSiteUri, anchoredLine, pair.callSiteCharacter);
            }
        } finally {
            jumpState.isExecuting = false;
        }
    });
}
