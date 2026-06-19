import * as vscode from 'vscode';

// Outward spiral search from nominalLine — O(radius) lines, O(1) per line.
// Returns the first line containing token, or nominalLine if not found.
export function reAnchorToken(
    document: vscode.TextDocument,
    nominalLine: number,
    token: string,
    radius = 50
): number {
    const lo = Math.max(0, nominalLine - radius);
    const hi = Math.min(document.lineCount - 1, nominalLine + radius);

    for (let delta = 0; delta <= radius; delta++) {
        const candidates = delta === 0
            ? [nominalLine]
            : [nominalLine - delta, nominalLine + delta];

        for (const line of candidates) {
            if (line < lo || line > hi) continue;
            if (document.lineAt(line).text.includes(token)) return line;
        }
    }

    return nominalLine;
}
