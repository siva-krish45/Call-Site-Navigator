import * as vscode from 'vscode';
import { pendingState } from './pending';
import { log } from './log';

// VS Code calls EVERY registered definition provider when resolving a definition
// — for Ctrl+Click, F12, and the peek/hover flows alike — passing the exact
// position being resolved. We never actually provide a definition (return null);
// we just record WHERE the request came from. That recorded position is the
// precise call site, and it works regardless of selection-change kind or whether
// the target is in the same file.
export function createDefinitionProvider(): vscode.DefinitionProvider {
    return {
        provideDefinition(
            document: vscode.TextDocument,
            position: vscode.Position,
        ): null {
            const wordRange = document.getWordRangeAtPosition(position);
            if (!wordRange) return null;

            pendingState.callSite = {
                uri:       document.uri,
                line:      position.line,
                character: position.character,
                token:     document.getText(wordRange),
                at:        Date.now(),
            };
            log.info(`[provider] definition requested for "${pendingState.callSite.token}" @ ${document.uri.fsPath}:${position.line}`);
            return null;
        },
    };
}
