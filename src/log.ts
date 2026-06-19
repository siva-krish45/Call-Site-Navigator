import * as vscode from 'vscode';

const channel = vscode.window.createOutputChannel('Call Site Navigator');

export const log = {
    info: (msg: string) => channel.appendLine(`[INFO]  ${msg}`),
    warn: (msg: string) => channel.appendLine(`[WARN]  ${msg}`),
    show: () => channel.show(true),
};
