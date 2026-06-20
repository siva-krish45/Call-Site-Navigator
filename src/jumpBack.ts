import * as vscode from 'vscode';
import { peekCallSite, popCallSite, getLastPopped, pushLastPoppedBack } from './store';
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
        
        // Priority 1: If stack has entries, pop the top one and jump back.
        const stackTop = peekCallSite(activeUri);
        if (stackTop) {
            jumpState.isExecuting = true;
            try {
                log.info(`Jump back (stack pop) -> jumping to call site line:${stackTop.line}`);
                const callDoc = await vscode.workspace.openTextDocument(stackTop.uri);
                const anchoredLine = reAnchorToken(callDoc, stackTop.line, stackTop.token);
                
                // Record where we are leaving from as the definitionLine
                stackTop.definitionLine = activeEditor.selection.active.line;

                // Pop it, moving it to lastPoppedSites
                popCallSite(activeUri);

                await revealAt(stackTop.uri, anchoredLine, stackTop.character);
            } finally {
                jumpState.isExecuting = false;
            }
            return;
        }

        // Priority 2: If stack is empty, toggle forward to the last popped definition
        const lastPopped = getLastPopped(activeUri);
        if (lastPopped && lastPopped.definitionLine !== undefined) {
            jumpState.isExecuting = true;
            try {
                log.info(`Toggle forward -> jumping back to definition line:${lastPopped.definitionLine}`);
                const doc = await vscode.workspace.openTextDocument(lastPopped.uri);
                const anchoredDefLine = reAnchorToken(doc, lastPopped.definitionLine, lastPopped.token);

                // Push back to stack so it can be popped again
                pushLastPoppedBack(activeUri, lastPopped);

                await revealAt(lastPopped.uri, anchoredDefLine, lastPopped.character);
            } finally {
                jumpState.isExecuting = false;
            }
            return;
        }

        log.info(`Jump back pressed — stack empty and no toggle target for active file: ${activeUri}`);
    });
}
