import * as vscode from 'vscode';
import { createDefinitionProvider } from './provider';
import { createGoToDefinitionCommand } from './goToDefinition';
import { createJumpBackCommand } from './jumpBack';
import {
    createActiveEditorListener,
    createSelectionListener,
    createDocumentChangeListener,
    createDocumentCloseListener,
    primeNavigationTracking,
    setDiagnosticRaw,
} from './listeners';
import { clearAll, dumpState } from './store';
import { log } from './log';

let diagnosticsOn = false;

export function activate(context: vscode.ExtensionContext): void {
    log.info('Call Site Navigator activated');

    // Close the "first navigation" gap by recording the already-open editor.
    primeNavigationTracking();

    context.subscriptions.push(
        // F12 intercept — primary, fully synchronous capture
        createGoToDefinitionCommand(),
        // Ctrl+Click intercept — fires if VS Code calls the provider chain
        vscode.languages.registerDefinitionProvider({ scheme: 'file' }, createDefinitionProvider()),
        // Cross-file Ctrl+Click pair completion — fires after navigation
        createActiveEditorListener(),
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
        // Toggle/clear guards + cursor tracking
        createSelectionListener(),
        createDocumentChangeListener(),
        createDocumentCloseListener(),
    );
}

export function deactivate(): void {
    clearAll();
}
