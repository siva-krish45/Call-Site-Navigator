// Minimal vscode stub for unit tests running outside the extension host
export const Uri = {
    file: (p: string) => ({ toString: () => `file://${p}`, fsPath: p }),
};

export const Position = class {
    constructor(public line: number, public character: number) {}
};

export const Range = class {
    constructor(public start: any, public end: any) {}
};

export const Selection = class {
    constructor(public anchor: any, public active: any) {}
};

export const languages = {
    registerDefinitionProvider: () => ({ dispose: () => {} }),
};

export const window = {
    activeTextEditor: undefined as any,
    showTextDocument: async () => ({}),
    onDidChangeTextEditorSelection: () => ({ dispose: () => {} }),
    onDidChangeActiveTextEditor: () => ({ dispose: () => {} }),
    createOutputChannel: () => ({ appendLine: () => {}, show: () => {} }),
};

export const workspace = {
    openTextDocument: async () => ({}),
    onDidChangeTextDocument: () => ({ dispose: () => {} }),
    onDidCloseTextDocument: () => ({ dispose: () => {} }),
};

export const commands = {
    registerCommand: () => ({ dispose: () => {} }),
    executeCommand: async () => undefined,
};

export enum TextEditorRevealType {
    InCenter = 2,
}

export enum TextEditorSelectionChangeKind {
    Keyboard = 1,
    Mouse    = 2,
    Command  = 3,
}

export const extensions = {
    getExtension: () => undefined,
};
