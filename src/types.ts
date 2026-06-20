import * as vscode from 'vscode';

export interface CallSite {
    uri:             vscode.Uri;
    line:            number;
    character:       number;
    token:           string;
    definitionLine?: number; // Stored when popped so we know where to toggle back to
}
