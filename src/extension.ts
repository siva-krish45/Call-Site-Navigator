import * as vscode from 'vscode';
import { createDefinitionProvider } from './provider';
import { createGoToDefinitionCommand } from './goToDefinition';
import { createJumpBackCommand } from './jumpBack';
import {
    createSelectionListener,
    createDocumentCloseListener,
    primeNavigationTracking,
    setDiagnosticRaw,
} from './listeners';
import { clearAll, dumpState } from './store';
import { log } from './log';

let diagnosticsOn = true;

export function activate(context: vscode.ExtensionContext): void {
    log.info('Call Site Navigator activated');

    // Close the "first navigation" gap by recording the already-open editor.
    primeNavigationTracking();

    context.subscriptions.push(
        // F12 intercept — primary, fully synchronous capture
        createGoToDefinitionCommand(),
        // Ctrl+Click intercept — fires if VS Code calls the provider chain
        vscode.languages.registerDefinitionProvider({ scheme: 'file' }, createDefinitionProvider()),
        // Jump back hotkey
        createJumpBackCommand(),
        // Diagnostics
        vscode.commands.registerCommand('callSiteNav.dumpState', () => {
            log.info(`--- store state (manual dump) ---\n${dumpState()}\n---------------------------------`);
            log.show();
        }),
        vscode.commands.registerCommand('callSiteNav.toggleDiagnostics', () => {
            diagnosticsOn = !diagnosticsOn;
            setDiagnosticRaw(diagnosticsOn);
            log.show();
        }),
        // Guards + cursor tracking
        createSelectionListener(),
        createDocumentCloseListener(),
    );
}

export function deactivate(): void {
    clearAll();
}
