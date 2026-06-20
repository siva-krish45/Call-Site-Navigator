import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { pushCallSite, clearAll, peekCallSite, getLastPopped } from '../../src/store';
import { captureGuard } from '../../src/captureGuard';
import { pendingState } from '../../src/pending';
import { _resetNavigationState } from '../../src/listeners';
import { CallSite } from '../../src/types';

const FIXTURE = path.join(__dirname, '../../../test/fixtures/sample-project/src');
const callerUri = vscode.Uri.file(path.join(FIXTURE, 'caller.ts'));
const utilsUri  = vscode.Uri.file(path.join(FIXTURE, 'utils.ts'));

// Known line numbers from caller.ts (0-indexed)
const CALL_SITE_LINE = 23;   // sameFileHelper() call site
const DEFINITION_LINE = 18;  // sameFileHelper implementation

function makeCallSite(definitionLine?: number): CallSite {
    return {
        uri:       callerUri,
        line:      CALL_SITE_LINE,
        character: 23,
        token:     'sameFileHelper',
        definitionLine: definitionLine,
    };
}

async function openAt(uri: vscode.Uri, line: number): Promise<vscode.TextEditor> {
    const doc = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(doc);
    const pos = new vscode.Position(line, 0);
    editor.selection = new vscode.Selection(pos, pos);
    return editor;
}

async function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

suiteSetup(async () => {
    // Ensure extension is active
    await vscode.extensions.getExtension('srk-tools.call-site-navigator')?.activate();
});

setup(() => {
    clearAll();
    _resetNavigationState();
    pendingState.callSite = null;
    captureGuard.suppress = true;
});

suite('Jump Back Command — Pops Stack & Empty-Stack Toggle', () => {
    test('first press pops stack, jumps back, and sets lastPoppedSite', async () => {
        pushCallSite(makeCallSite());
        await openAt(callerUri, DEFINITION_LINE);

        await vscode.commands.executeCommand('callSiteNav.jumpBack');
        await sleep(200);

        const editor = vscode.window.activeTextEditor!;
        assert.equal(editor.document.uri.fsPath, callerUri.fsPath);
        assert.equal(editor.selection.active.line, CALL_SITE_LINE);
        
        // Stack should be popped and lastPoppedSite populated
        assert.strictEqual(peekCallSite(callerUri.toString()), undefined);
        const lp = getLastPopped(callerUri.toString());
        assert.ok(lp);
        assert.equal(lp!.definitionLine, DEFINITION_LINE);
    });

    test('second press (when stack is empty) toggles forward and pushes back', async () => {
        // Set up popped site
        const cs = makeCallSite(DEFINITION_LINE);
        pushCallSite(cs);
        popCallSite(callerUri.toString());

        await openAt(callerUri, CALL_SITE_LINE);

        // Alt+Q should toggle forward
        await vscode.commands.executeCommand('callSiteNav.jumpBack');
        await sleep(200);

        const editor = vscode.window.activeTextEditor!;
        assert.equal(editor.document.uri.fsPath, callerUri.fsPath);
        assert.equal(editor.selection.active.line, DEFINITION_LINE);
        
        // Toggle should push call site back to stack
        const stackCs = peekCallSite(callerUri.toString());
        assert.ok(stackCs);
        assert.equal(stackCs!.line, CALL_SITE_LINE);
        assert.strictEqual(getLastPopped(callerUri.toString()), undefined);
    });

    test('edits and clicks do NOT clear stack or toggle target', async () => {
        // Pop call site to arm toggle
        const cs = makeCallSite(DEFINITION_LINE);
        pushCallSite(cs);
        popCallSite(callerUri.toString());

        const editor = await openAt(callerUri, CALL_SITE_LINE);
        await sleep(100);

        // Edit document
        await editor.edit(eb => eb.insert(new vscode.Position(0, 0), ' '));
        await sleep(100);

        // Click around (drift cursor far away)
        const farPos = new vscode.Position(CALL_SITE_LINE - 5, 0);
        editor.selection = new vscode.Selection(farPos, farPos);
        await sleep(100);

        // Toggle target should survive edits and clicks!
        const lp = getLastPopped(callerUri.toString());
        assert.ok(lp);
        assert.equal(lp!.definitionLine, DEFINITION_LINE);

        // Restore document
        await vscode.commands.executeCommand('undo');
    });

    test('nested jumps (1 -> 100 -> 150) walk back properly down LIFO stack without toggling', async () => {
        // Nested stack: [line 3, line 9]
        pushCallSite({ uri: callerUri, line: 3, character: 0, token: 'findAge' });
        pushCallSite({ uri: callerUri, line: 9, character: 0, token: 'findAge' });

        await openAt(callerUri, 15);

        // First Alt+Q pops line 9 and jumps to line 9
        await vscode.commands.executeCommand('callSiteNav.jumpBack');
        await sleep(200);
        let editor = vscode.window.activeTextEditor!;
        assert.equal(editor.selection.active.line, 9);
        assert.equal(peekCallSite(callerUri.toString())!.line, 3); // top of stack is now 3

        // Second Alt+Q pops line 3 and jumps to line 3
        await vscode.commands.executeCommand('callSiteNav.jumpBack');
        await sleep(200);
        editor = vscode.window.activeTextEditor!;
        assert.equal(editor.selection.active.line, 3);
        assert.strictEqual(peekCallSite(callerUri.toString()), undefined); // stack is empty
    });
});

suite('No-op cases', () => {
    test('does nothing when stack is empty', async () => {
        await openAt(callerUri, DEFINITION_LINE);
        await assert.doesNotReject(
            Promise.resolve(vscode.commands.executeCommand('callSiteNav.jumpBack'))
        );
    });
});

suite('Capture mechanism — end-to-end', () => {
    test('cross-file navigation is ignored by tryCapture', async () => {
        clearAll();
        _resetNavigationState();
        captureGuard.suppress = false;

        const editor = await openAt(callerUri, 9); // cursor near the call site
        await sleep(100);

        // Simulate provider resolving definition to a different file
        pendingState.callSite = {
            uri:       callerUri,
            line:      9,
            character: 14,
            token:     'findAge',
            at:        Date.now(),
        };

        // Open different file (utils.ts)
        await openAt(utilsUri, 1);
        await sleep(150);

        const cs = peekCallSite(callerUri.toString());
        assert.strictEqual(cs, undefined, 'cross-file jump should be ignored by capture');
    });

    test('same-file Ctrl+Click: provider anchor + same-file jump records a call site', async () => {
        clearAll();
        _resetNavigationState();
        captureGuard.suppress = false;

        const editor = await openAt(callerUri, 9); // cursor near the call site
        await sleep(100);

        // Simulate VS Code asking our DefinitionProvider for "findAge" @ line 9
        pendingState.callSite = {
            uri:       callerUri,
            line:      9,
            character: 14,
            token:     'findAge',
            at:        Date.now(),
        };

        // Cursor jumps to the same-file definition (line 3) — a >=3-line move
        const defPos = new vscode.Position(3, 6);
        editor.selection = new vscode.Selection(defPos, defPos);
        await sleep(150);

        const cs = peekCallSite(callerUri.toString());
        assert.ok(cs, 'a same-file call site should be captured');
        assert.equal(cs!.token, 'findAge');
        assert.equal(cs!.line, 9);
    });

    test('same-file Ctrl+Click WITHOUT provider: fast click→auto-jump is captured', async () => {
        clearAll();
        _resetNavigationState();
        captureGuard.suppress = false;
        pendingState.callSite = null;

        const editor = await openAt(callerUri, 9);
        await sleep(120);

        // Auto-jump to the same-file definition immediately (tight window).
        const defPos = new vscode.Position(3, 6);
        editor.selection = new vscode.Selection(defPos, defPos);
        await sleep(120);

        const cs = peekCallSite(callerUri.toString());
        assert.ok(cs, 'a fast same-file auto-jump should be captured without a provider');
        assert.equal(cs!.line, 9);
    });

    test('REGRESSION: clicking around inside a file does NOT fabricate a call site', async () => {
        clearAll();
        _resetNavigationState();
        captureGuard.suppress = false;
        pendingState.callSite = null;

        const editor = await openAt(callerUri, 3);
        await sleep(450);

        // Click far down inside the same file (a >=3-line move, but NOT a navigation).
        const p1 = new vscode.Position(9, 0);
        editor.selection = new vscode.Selection(p1, p1);
        await sleep(450);

        // Click again somewhere else in the file.
        const p2 = new vscode.Position(6, 0);
        editor.selection = new vscode.Selection(p2, p2);
        await sleep(450);

        assert.strictEqual(peekCallSite(callerUri.toString()), undefined,
            'bare same-file clicks must not create call-site records');
    });

    test('same-file F12: call site is created by the goToDefinition command', async () => {
        clearAll();
        captureGuard.suppress = false;

        const callerDoc = await vscode.workspace.openTextDocument(callerUri);
        const callerEditor = await vscode.window.showTextDocument(callerDoc);
        const callPos = new vscode.Position(23, 23); // inside "sameFileHelper"
        callerEditor.selection = new vscode.Selection(callPos, callPos);
        await sleep(100);

        // Fire our F12 command override
        await vscode.commands.executeCommand('callSiteNav.goToDefinition');
        await sleep(400);

        const cs = peekCallSite(callerUri.toString());
        assert.ok(cs, 'call site should be captured after same-file F12 navigation');
        assert.equal(cs!.token, 'sameFileHelper');
        assert.equal(cs!.line, 23);
    });
});

suite('Fuzzy re-anchoring', () => {
    test('lands correctly when call site token found near stored line', async () => {
        const driftedCallSite: CallSite = {
            ...makeCallSite(),
            line: 24, // stored line is "wrong" — sameFileHelper() is actually at line 23
        };
        pushCallSite(driftedCallSite);
        await openAt(callerUri, DEFINITION_LINE);

        await vscode.commands.executeCommand('callSiteNav.jumpBack');
        await sleep(200);

        const editor = vscode.window.activeTextEditor!;
        assert.equal(editor.document.uri.fsPath, callerUri.fsPath);
        assert.equal(editor.selection.active.line, CALL_SITE_LINE);
    });
});

// Helper for tests to trigger stack pops manually
function popCallSite(uri: string): CallSite | undefined {
    const { popCallSite: storePop } = require('../../src/store');
    return storePop(uri);
}
