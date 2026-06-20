import * as assert from 'assert';
import {
    pushCallSite,
    popCallSite,
    peekCallSite,
    getLastPopped,
    clearLastPopped,
    pushLastPoppedBack,
    evictDocument,
    clearAll,
    _getStack,
    _getLastPoppedMap,
} from '../../src/store';
import { CallSite } from '../../src/types';

function makeUri(path: string) {
    return { toString: () => path } as any;
}

function makeCallSite(
    path: string,
    line: number,
    token = 'findAge'
): CallSite {
    return {
        uri:       makeUri(path),
        line:      line,
        character: 0,
        token:     token,
    };
}

beforeEach(() => clearAll());

describe('pushCallSite', () => {
    it('populates callSiteStacks for same-file pairs', () => {
        pushCallSite(makeCallSite('file:///a.ts', 10));
        assert.equal(_getStack('file:///a.ts')?.length, 1);
    });

    it('clears lastPopped on new pushCallSite', () => {
        const cs = makeCallSite('file:///a.ts', 10);
        pushCallSite(cs);
        popCallSite('file:///a.ts');
        assert.ok(getLastPopped('file:///a.ts'));

        pushCallSite(makeCallSite('file:///a.ts', 20));
        assert.strictEqual(getLastPopped('file:///a.ts'), undefined);
    });

    it('enforces MAX_STACK_DEPTH by evicting oldest entry', () => {
        for (let i = 0; i < 51; i++) {
            pushCallSite(makeCallSite('file:///a.ts', i));
        }
        const stack = _getStack('file:///a.ts')!;
        assert.equal(stack.length, 50);
        assert.equal(stack[0].line, 1); // line 0 was evicted
    });

    it('multiple pushes accumulate on the stack', () => {
        pushCallSite(makeCallSite('file:///a.ts', 10));
        pushCallSite(makeCallSite('file:///a.ts', 20));
        assert.equal(_getStack('file:///a.ts')?.length, 2);
    });

    it('dedups an identical top-of-stack call site instead of stacking it', () => {
        pushCallSite(makeCallSite('file:///a.ts', 10));
        pushCallSite(makeCallSite('file:///a.ts', 10));
        assert.equal(_getStack('file:///a.ts')?.length, 1);
    });

    it('does NOT dedup when line differs', () => {
        pushCallSite(makeCallSite('file:///a.ts', 10));
        pushCallSite(makeCallSite('file:///a.ts', 11));
        assert.equal(_getStack('file:///a.ts')?.length, 2);
    });
});

describe('popCallSite & getLastPopped', () => {
    it('popCallSite retrieves, deletes from stack, and sets lastPoppedSite', () => {
        const cs = makeCallSite('file:///a.ts', 10);
        pushCallSite(cs);
        assert.strictEqual(popCallSite('file:///a.ts'), cs);
        assert.strictEqual(getLastPopped('file:///a.ts'), cs);
        assert.strictEqual(_getStack('file:///a.ts'), undefined);
    });
});

describe('pushLastPoppedBack', () => {
    it('pushes the site back onto stack and clears lastPopped', () => {
        const cs = makeCallSite('file:///a.ts', 10);
        pushCallSite(cs);
        popCallSite('file:///a.ts');

        const popped = getLastPopped('file:///a.ts')!;
        pushLastPoppedBack('file:///a.ts', popped);

        assert.equal(_getStack('file:///a.ts')?.length, 1);
        assert.strictEqual(_getStack('file:///a.ts')![0], cs);
        assert.strictEqual(getLastPopped('file:///a.ts'), undefined);
    });
});

describe('evictDocument', () => {
    it('clears stack and lastPopped for the given URI', () => {
        pushCallSite(makeCallSite('file:///a.ts', 10));
        popCallSite('file:///a.ts');
        evictDocument('file:///a.ts');
        assert.strictEqual(_getStack('file:///a.ts'), undefined);
        assert.strictEqual(getLastPopped('file:///a.ts'), undefined);
    });
});
