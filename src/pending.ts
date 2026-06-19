import * as vscode from 'vscode';

// Shared mutable object — safe across CJS compiled modules (same pattern as jumpState).
export interface PendingCallSite {
    uri:       vscode.Uri;
    line:      number;
    character: number;
    token:     string;
    at:        number; // Date.now() when the definition was requested
}

export const pendingState: { callSite: PendingCallSite | null } = {
    callSite: null,
};
