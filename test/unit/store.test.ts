import * as assert from 'assert';
import {
    pushPair,
    getActivePair,
    findPairLoose,
    popPair,
    evictDocument,
    clearAll,
    _getStack,
    _getDefinitionIndex,
} from '../../src/store';
import { CallSitePair } from '../../src/types';

function makeUri(path: string) {
    return { toString: () => path } as any;
}

function makePair(
    callPath: string,
    callLine: number,
    defPath: string,
    defLine: number
): CallSitePair {
    return {
        callSiteUri:       makeUri(callPath),
        callSiteLine:      callLine,
        callSiteCharacter: 0,
        callSiteToken:     'findAge',
        definitionUri:       makeUri(defPath),
        definitionLine:      defLine,
        definitionCharacter: 0,
        toggleTarget:        null,
    };
}

beforeEach(() => clearAll());

describe('pushPair', () => {
    it('populates callSiteStacks', () => {
        pushPair(makePair('file:///a.ts', 10, 'file:///b.ts', 42));
        assert.equal(_getStack('file:///a.ts')?.length, 1);
    });

    it('populates definitionIndex for cross-file pairs', () => {
        pushPair(makePair('file:///a.ts', 10, 'file:///b.ts', 42));
        assert.ok(_getDefinitionIndex().has('file:///b.ts'));
    });

    it('does NOT populate definitionIndex for same-file pairs', () => {
        pushPair(makePair('file:///a.ts', 10, 'file:///a.ts', 80));
        assert.ok(!_getDefinitionIndex().has('file:///a.ts'));
    });

    it('enforces MAX_STACK_DEPTH by evicting oldest entry', () => {
        for (let i = 0; i < 51; i++) {
            pushPair(makePair('file:///a.ts', i, 'file:///b.ts', i));
        }
        const stack = _getStack('file:///a.ts')!;
        assert.equal(stack.length, 50);
        assert.equal(stack[0].callSiteLine, 1); // line 0 was evicted
    });

    it('multiple pushes accumulate on the stack', () => {
        pushPair(makePair('file:///a.ts', 10, 'file:///b.ts', 1));
        pushPair(makePair('file:///a.ts', 20, 'file:///b.ts', 2));
        assert.equal(_getStack('file:///a.ts')?.length, 2);
    });

    it('dedups an identical top-of-stack pair instead of stacking it', () => {
        pushPair(makePair('file:///a.ts', 10, 'file:///b.ts', 42));
        pushPair(makePair('file:///a.ts', 10, 'file:///b.ts', 42));
        assert.equal(_getStack('file:///a.ts')?.length, 1);
    });

    it('resets toggleTarget when a duplicate navigation is recorded', () => {
        const pair = makePair('file:///a.ts', 10, 'file:///b.ts', 42);
        pushPair(pair);
        pair.toggleTarget = { uri: makeUri('file:///b.ts'), line: 42, character: 0 };
        pushPair(makePair('file:///a.ts', 10, 'file:///b.ts', 42));
        assert.strictEqual(_getStack('file:///a.ts')![0].toggleTarget, null);
    });

    it('does NOT dedup when only the definition line differs', () => {
        pushPair(makePair('file:///a.ts', 10, 'file:///b.ts', 42));
        pushPair(makePair('file:///a.ts', 10, 'file:///b.ts', 43));
        assert.equal(_getStack('file:///a.ts')?.length, 2);
    });
});

describe('findPairLoose', () => {
    it('finds a pair by exact definition URI (same as getActivePair)', () => {
        const pair = makePair('file:///a.ts', 10, 'file:///b.ts', 42);
        pushPair(pair);
        assert.strictEqual(findPairLoose('file:///b.ts'), pair);
    });

    it('finds a pair when the active file is the call site', () => {
        const pair = makePair('file:///a.ts', 10, 'file:///b.ts', 42);
        pushPair(pair);
        assert.strictEqual(findPairLoose('file:///a.ts'), pair);
    });

    it('returns undefined when nothing has been recorded', () => {
        assert.strictEqual(findPairLoose('file:///nothing.ts'), undefined);
    });

    it('falls back to the newest pair when the URI matches nothing', () => {
        const pair = makePair('file:///a.ts', 10, 'file:///b.ts', 42);
        pushPair(pair);
        // An unrelated active file still yields the most-recent pair as a fallback.
        assert.strictEqual(findPairLoose('file:///unrelated.ts'), pair);
    });
});

describe('getActivePair', () => {
    it('finds pair via definitionIndex (cross-file lookup)', () => {
        const pair = makePair('file:///a.ts', 10, 'file:///b.ts', 42);
        pushPair(pair);
        assert.strictEqual(getActivePair('file:///b.ts'), pair);
    });

    it('finds pair via callSiteStack (same-file lookup)', () => {
        const pair = makePair('file:///a.ts', 10, 'file:///a.ts', 80);
        pushPair(pair);
        assert.strictEqual(getActivePair('file:///a.ts'), pair);
    });

    it('returns undefined for unknown URI', () => {
        assert.strictEqual(getActivePair('file:///unknown.ts'), undefined);
    });

    it('returns top of stack (most recent pair)', () => {
        const p1 = makePair('file:///a.ts', 10, 'file:///b.ts', 1);
        const p2 = makePair('file:///a.ts', 20, 'file:///b.ts', 2);
        pushPair(p1);
        pushPair(p2);
        // definitionIndex holds the last pushed; stack top is p2
        assert.strictEqual(getActivePair('file:///b.ts'), p2);
    });

    it('prefers a fresh same-file pair over an older cross-file landing in the same file', () => {
        // A → B (cross-file), THEN a same-file jump within B.
        const cross = makePair('file:///a.ts', 10, 'file:///b.ts', 100);
        pushPair(cross);
        const sameFile = makePair('file:///b.ts', 105, 'file:///b.ts', 200);
        pushPair(sameFile);
        // Active in B: the more recent same-file pair must win, not the cross-file one.
        assert.strictEqual(getActivePair('file:///b.ts'), sameFile);
    });

    it('prefers a fresh cross-file landing over an older same-file pair', () => {
        const sameFile = makePair('file:///b.ts', 105, 'file:///b.ts', 200);
        pushPair(sameFile);
        const cross = makePair('file:///a.ts', 10, 'file:///b.ts', 100);
        pushPair(cross);
        // Active in B: the more recent cross-file landing must win.
        assert.strictEqual(getActivePair('file:///b.ts'), cross);
    });
});

describe('popPair', () => {
    it('removes pair from callSiteStacks', () => {
        const pair = makePair('file:///a.ts', 10, 'file:///b.ts', 42);
        pushPair(pair);
        popPair(pair);
        assert.strictEqual(_getStack('file:///a.ts'), undefined);
    });

    it('removes pair from definitionIndex', () => {
        const pair = makePair('file:///a.ts', 10, 'file:///b.ts', 42);
        pushPair(pair);
        popPair(pair);
        assert.strictEqual(getActivePair('file:///b.ts'), undefined);
    });

    it('leaves other pairs in the stack intact', () => {
        const p1 = makePair('file:///a.ts', 10, 'file:///b.ts', 1);
        const p2 = makePair('file:///a.ts', 20, 'file:///b.ts', 2);
        pushPair(p1);
        pushPair(p2);
        popPair(p2);
        assert.equal(_getStack('file:///a.ts')?.length, 1);
        assert.strictEqual(_getStack('file:///a.ts')?.[0], p1);
    });
});

describe('evictDocument', () => {
    it('clears callSiteStacks for the given URI', () => {
        pushPair(makePair('file:///a.ts', 10, 'file:///b.ts', 42));
        evictDocument('file:///a.ts');
        assert.strictEqual(_getStack('file:///a.ts'), undefined);
    });

    it('clears definitionIndex for the given URI', () => {
        pushPair(makePair('file:///a.ts', 10, 'file:///b.ts', 42));
        evictDocument('file:///b.ts');
        assert.strictEqual(getActivePair('file:///b.ts'), undefined);
    });
});
