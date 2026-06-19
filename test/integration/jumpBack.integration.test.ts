import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { pushPair, clearAll, getActivePair } from '../../src/store';
import { captureGuard } from '../../src/captureGuard';
import { pendingState } from '../../src/pending';
import { _resetNavigationState } from '../../src/listeners';
import { CallSitePair } from '../../src/types';

const FIXTURE = path.join(__dirname, '../../../test/fixtures/sample-project/src');
const callerUri = vscode.Uri.file(path.join(FIXTURE, 'caller.ts'));
const utilsUri  = vscode.Uri.file(path.join(FIXTURE, 'utils.ts'));

// Known line numbers from caller.ts / utils.ts (0-indexed)
const CALL_SITE_LINE = 3;   // findAge(1990) in caller.ts
const DEFINITION_LINE = 1;  // findAge implementation in utils.ts

function makePair(withToggle = false): CallSitePair {
    return {
        callSiteUri:       callerUri,
        callSiteLine:      CALL_SITE_LINE,
        callSiteCharacter: 14,
        callSiteToken:     'findAge',
        definitionUri:       utilsUri,
        definitionLine:      DEFINITION_LINE,
        definitionCharacter: 16,
        toggleTarget: withToggle
            ? { uri: utilsUri, line: DEFINITION_LINE, character: 16 }
            : null,
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
    // Extension ID must match publisher + name in package.json
    await vscode.extensions.getExtension('your-publisher-id.call-site-navigator')?.activate();
});

setup(() => {
    clearAll();
    _resetNavigationState();
    pendingState.callSite = null;
    // Tests drive the cursor via `editor.selection = ...`, which VS Code reports as
    // a Command-kind selection change — indistinguishable from a real navigation.
    // Suppress capture by default so test orchestration does not fabricate pairs.
    // Tests that specifically exercise capture re-enable it explicitly.
    captureGuard.suppress = true;
});

suite('Jump Back Command — first press', () => {
    test('jumps to call site from definition file', async () => {
        pushPair(makePair());
        await openAt(utilsUri, DEFINITION_LINE);

        await vscode.commands.executeCommand('callSiteNav.jumpBack');
        await sleep(200);

        const editor = vscode.window.activeTextEditor!;
        assert.equal(editor.document.uri.fsPath, callerUri.fsPath);
        assert.equal(editor.selection.active.line, CALL_SITE_LINE);
    });

    test('sets toggleTarget after first press', async () => {
        const pair = makePair();
        pushPair(pair);
        await openAt(utilsUri, DEFINITION_LINE);

        await vscode.commands.executeCommand('callSiteNav.jumpBack');
        await sleep(200);

        assert.ok(pair.toggleTarget, 'toggleTarget should be populated after first press');
        assert.equal(pair.toggleTarget!.uri.toString(), utilsUri.toString());
    });

    test('does not use revealDefinition — lands at exact call site without extra nav entry', async () => {
        // showTextDocument inherently adds one entry to VS Code's nav history regardless
        // of how it is called — there is no public API to suppress this. What we guarantee
        // is that we do NOT call editor.action.revealDefinition (which would add a second
        // entry), and that we land at the precise call site line.
        pushPair(makePair());
        await openAt(utilsUri, DEFINITION_LINE);

        await vscode.commands.executeCommand('callSiteNav.jumpBack');
        await sleep(200);

        const editor = vscode.window.activeTextEditor!;
        assert.equal(editor.document.uri.fsPath, callerUri.fsPath,
            'should land in caller.ts');
        assert.equal(editor.selection.active.line, CALL_SITE_LINE,
            'should land on the exact call site line');
    });
});

suite('Jump Back Command — second press (toggle)', () => {
    test('toggles back to definition and pops pair', async () => {
        const pair = makePair(true); // pre-populated toggleTarget
        pushPair(pair);
        await openAt(callerUri, CALL_SITE_LINE);

        await vscode.commands.executeCommand('callSiteNav.jumpBack');
        await sleep(200);

        const editor = vscode.window.activeTextEditor!;
        assert.equal(editor.document.uri.fsPath, utilsUri.fsPath);
        assert.equal(editor.selection.active.line, DEFINITION_LINE);
        // Pair should be popped
        assert.strictEqual(getActivePair(utilsUri.toString()), undefined);
    });
});

suite('No-op cases', () => {
    test('does nothing when stack is empty', async () => {
        await openAt(utilsUri, DEFINITION_LINE);
        // Should not throw
        await assert.doesNotReject(
            Promise.resolve(vscode.commands.executeCommand('callSiteNav.jumpBack'))
        );
    });
});

suite('Toggle target clearing', () => {
    test('clears toggleTarget on document mutation', async () => {
        const pair = makePair(true);
        pushPair(pair);
        await openAt(utilsUri, DEFINITION_LINE);

        // Simulate a text edit
        const editor = vscode.window.activeTextEditor!;
        await editor.edit(eb => eb.insert(new vscode.Position(0, 0), ' '));
        await sleep(100);

        assert.strictEqual(pair.toggleTarget, null);

        // Undo the edit to keep fixture clean
        await vscode.commands.executeCommand('undo');
    });

    test('clears toggleTarget on cursor move > 2 lines from call site', async () => {
        const pair = makePair(true);
        pushPair(pair);
        await openAt(callerUri, CALL_SITE_LINE);
        await sleep(100);

        // Move cursor more than 2 lines away
        const editor = vscode.window.activeTextEditor!;
        const farPos = new vscode.Position(CALL_SITE_LINE + 5, 0);
        editor.selection = new vscode.Selection(farPos, farPos);
        await sleep(100);

        assert.strictEqual(pair.toggleTarget, null);
    });

    test('does NOT clear toggleTarget on cursor move within 2 lines', async () => {
        const pair = makePair(true);
        pushPair(pair);
        await openAt(callerUri, CALL_SITE_LINE);
        await sleep(100);

        const editor = vscode.window.activeTextEditor!;
        const nearPos = new vscode.Position(CALL_SITE_LINE + 1, 0);
        editor.selection = new vscode.Selection(nearPos, nearPos);
        await sleep(100);

        assert.ok(pair.toggleTarget, 'toggleTarget should survive small cursor movement');
    });
});

suite('Capture mechanism — end-to-end', () => {
    test('cross-file Ctrl+Click: pair is created via cursor cache when active editor changes', async () => {
        // Simulate Ctrl+Click: open caller.ts, position cursor on "findAge" at line 3,
        // then switch to utils.ts. createActiveEditorListener should capture the pair
        // from the last word cursor (no F12 command involved).
        clearAll();
        captureGuard.suppress = false; // this test exercises real capture

        // Open caller.ts and put cursor on the "findAge" token at line 3, char 14
        const callerDoc = await vscode.workspace.openTextDocument(callerUri);
        const callerEditor = await vscode.window.showTextDocument(callerDoc);
        const callPos = new vscode.Position(3, 14); // inside "findAge"
        callerEditor.selection = new vscode.Selection(callPos, callPos);
        await sleep(150); // let selection-change event fire and populate cursorCache

        // Now switch to utils.ts (simulates the definition-file landing after Ctrl+Click)
        const utilsDoc = await vscode.workspace.openTextDocument(utilsUri);
        const utilsEditor = await vscode.window.showTextDocument(utilsDoc);
        const defPos = new vscode.Position(DEFINITION_LINE, 0);
        utilsEditor.selection = new vscode.Selection(defPos, defPos);
        await sleep(150); // let onDidChangeActiveTextEditor fire

        // The pair should now be in the store keyed by utilsUri
        const pair = getActivePair(utilsUri.toString());
        assert.ok(pair, 'pair should be captured after simulated Ctrl+Click navigation');
        assert.equal(pair!.callSiteToken, 'findAge');
        assert.equal(pair!.callSiteLine, 3);
        assert.equal(pair!.callSiteUri.fsPath, callerUri.fsPath);
        assert.equal(pair!.definitionUri.fsPath, utilsUri.fsPath);
    });

    test('same-file Ctrl+Click: provider anchor + same-file jump records a pair', async () => {
        // Reproduces the real-world failure: a definition in the SAME file. No
        // active-editor change fires, so the only signals are the DefinitionProvider
        // (pendingState) and the cursor move. We simulate the provider having fired
        // for "findAge" at line 9, then the cursor jumping to its definition at line 3.
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

        const pair = getActivePair(callerUri.toString());
        assert.ok(pair, 'a same-file pair should be captured');
        assert.equal(pair!.callSiteToken, 'findAge');
        assert.equal(pair!.callSiteLine, 9);
        assert.equal(pair!.callSiteUri.fsPath, callerUri.fsPath);
        assert.equal(pair!.definitionUri.fsPath, callerUri.fsPath);
        assert.equal(pair!.definitionLine, 3);
    });

    test('cross-file F12: pair is created by the goToDefinition command', async () => {
        // The F12 command captures the call site synchronously, navigates, then
        // pairs with where it landed.
        clearAll();
        captureGuard.suppress = false; // this test exercises real capture

        const callerDoc = await vscode.workspace.openTextDocument(callerUri);
        const callerEditor = await vscode.window.showTextDocument(callerDoc);
        const callPos = new vscode.Position(3, 14);
        callerEditor.selection = new vscode.Selection(callPos, callPos);
        await sleep(100);

        // Fire our F12 command — it captures the call site, runs revealDefinition,
        // and records the pair once navigation settles.
        await vscode.commands.executeCommand('callSiteNav.goToDefinition');
        await sleep(300); // language server resolution + navigation

        const pair = getActivePair(vscode.window.activeTextEditor!.document.uri.toString());
        assert.ok(pair, 'pair should be captured after F12 navigation');
        assert.equal(pair!.callSiteToken, 'findAge');
        assert.equal(pair!.callSiteUri.fsPath, callerUri.fsPath);
    });
});

suite('Same-file vs cross-file precedence', () => {
    test('after a cross-file jump INTO a file, a later same-file jump wins on jump-back', async () => {
        // Reproduces the reported bug:
        //   utils.ts --(cross-file)--> caller.ts, THEN caller.ts --(same-file)--> caller.ts
        // Pressing jump-back in caller.ts must return to the SAME-FILE call site
        // (line 9), not back across to utils.ts.
        clearAll();

        // 1) cross-file pair: utils.ts (call site) → caller.ts (definition landing)
        const crossPair: CallSitePair = {
            callSiteUri:       utilsUri,
            callSiteLine:      1,
            callSiteCharacter: 0,
            callSiteToken:     'findAge',
            definitionUri:       callerUri,
            definitionLine:      3,
            definitionCharacter: 14,
            toggleTarget:        null,
        };
        pushPair(crossPair);

        // 2) same-file pair within caller.ts: line 9 (findAge call) → line 3 (another findAge)
        const sameFilePair: CallSitePair = {
            callSiteUri:       callerUri,
            callSiteLine:      9,
            callSiteCharacter: 14,
            callSiteToken:     'findAge',
            definitionUri:       callerUri,
            definitionLine:      3,
            definitionCharacter: 14,
            toggleTarget:        null,
        };
        pushPair(sameFilePair);

        // Land in caller.ts at the same-file definition line (3), as if we just jumped there
        await openAt(callerUri, 3);

        await vscode.commands.executeCommand('callSiteNav.jumpBack');
        await sleep(200);

        const editor = vscode.window.activeTextEditor!;
        // Must stay in caller.ts (same-file), NOT cross back to utils.ts
        assert.equal(editor.document.uri.fsPath, callerUri.fsPath,
            'jump-back should stay in the same file, not cross to utils.ts');
        // Must land on the same-file call site (line 9)
        assert.equal(editor.selection.active.line, 9,
            'should return to the same-file call site at line 9');
    });
});

suite('Fuzzy re-anchoring', () => {
    test('lands correctly when call site token found near stored line', async () => {
        // Simulate line drift: store line 4 (the blank line after findAge(1990)).
        // Spiral from 4 finds findAge at line 3 (delta=1) before line 6 (delta=2),
        // so the anchor corrects from stored line 4 to actual line 3.
        const driftedPair: CallSitePair = {
            ...makePair(),
            callSiteLine: 4, // stored line is "wrong" — findAge(1990) is actually at line 3
        };
        pushPair(driftedPair);
        await openAt(utilsUri, DEFINITION_LINE);

        await vscode.commands.executeCommand('callSiteNav.jumpBack');
        await sleep(200);

        const editor = vscode.window.activeTextEditor!;
        assert.equal(editor.document.uri.fsPath, callerUri.fsPath);
        // Should land at line 3 (actual findAge position), not line 1 (stored)
        assert.equal(editor.selection.active.line, CALL_SITE_LINE);
    });
});
