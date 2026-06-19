import * as assert from 'assert';
import { createDefinitionProvider } from '../../src/provider';
import { pendingState } from '../../src/pending';

function makeUri(path: string) {
    return { toString: () => path, fsPath: path } as any;
}

function makePosition(line: number, char: number) {
    return { line, character: char } as any;
}

function makeDocument(path: string, word: string) {
    return {
        uri: makeUri(path),
        getText: () => word,
        getWordRangeAtPosition: () => ({ start: makePosition(0, 0), end: makePosition(0, word.length) }),
    } as any;
}

beforeEach(() => { pendingState.callSite = null; });

describe('createDefinitionProvider', () => {
    it('sets pendingState.callSite when word range found', () => {
        const provider = createDefinitionProvider();
        provider.provideDefinition(makeDocument('file:///a.ts', 'findAge'), makePosition(10, 5), {} as any);
        assert.ok(pendingState.callSite);
        assert.equal(pendingState.callSite!.line, 10);
        assert.equal(pendingState.callSite!.token, 'findAge');
    });

    it('does not set pendingState.callSite when no word range', () => {
        const provider = createDefinitionProvider();
        const docNoWord = {
            uri: makeUri('file:///a.ts'),
            getText: () => '',
            getWordRangeAtPosition: () => undefined,
        } as any;
        provider.provideDefinition(docNoWord, makePosition(0, 0), {} as any);
        assert.strictEqual(pendingState.callSite, null);
    });

    it('always returns null', () => {
        const provider = createDefinitionProvider();
        const result = provider.provideDefinition(
            makeDocument('file:///a.ts', 'findAge'), makePosition(10, 5), {} as any
        );
        assert.strictEqual(result, null);
    });

    it('overwrites previous pendingState on successive calls', () => {
        const provider = createDefinitionProvider();
        provider.provideDefinition(makeDocument('file:///a.ts', 'findAge'), makePosition(5, 0), {} as any);
        provider.provideDefinition(makeDocument('file:///a.ts', 'getUser'), makePosition(20, 0), {} as any);
        assert.equal(pendingState.callSite!.token, 'getUser');
        assert.equal(pendingState.callSite!.line, 20);
    });
});
