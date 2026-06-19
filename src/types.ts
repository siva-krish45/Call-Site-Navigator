import * as vscode from 'vscode';

export interface CallSitePair {
    callSiteUri:       vscode.Uri;
    callSiteLine:      number;
    callSiteCharacter: number;
    callSiteToken:     string;

    definitionUri:       vscode.Uri;
    definitionLine:      number;
    definitionCharacter: number;

    // Populated on first jump-back press; cleared on file mutation or >2-line drift
    toggleTarget: { uri: vscode.Uri; line: number; character: number } | null;

    // Monotonic recency stamp assigned by the store on push. Higher = more recent.
    // Used to resolve which pair "owns" a file when it is both a definition target
    // (cross-file) and a call site (same-file). Assigned internally — callers omit it.
    seq?: number;
}
