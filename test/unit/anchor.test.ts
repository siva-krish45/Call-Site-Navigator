import * as assert from 'assert';
import { reAnchorToken } from '../../src/anchor';

function makeDoc(lines: string[]) {
    return {
        lineCount: lines.length,
        lineAt: (n: number) => ({ text: lines[n] }),
    } as any;
}

describe('reAnchorToken', () => {
    it('returns nominalLine when token is present there', () => {
        const doc = makeDoc(['foo()', 'bar()', 'findAge()']);
        assert.equal(reAnchorToken(doc, 2, 'findAge'), 2);
    });

    it('finds token shifted below nominalLine', () => {
        const doc = makeDoc(['', '', '', '', '', 'findAge()']);
        assert.equal(reAnchorToken(doc, 2, 'findAge', 10), 5);
    });

    it('finds token shifted above nominalLine', () => {
        const doc = makeDoc(['findAge()', '', '', '', '']);
        assert.equal(reAnchorToken(doc, 3, 'findAge', 10), 0);
    });

    it('falls back to nominalLine when token is absent', () => {
        const doc = makeDoc(['foo()', 'bar()', 'baz()']);
        assert.equal(reAnchorToken(doc, 1, 'findAge', 50), 1);
    });

    it('respects radius and does not search beyond it', () => {
        // token is at line 100, radius is 10 — should not be found
        const lines = Array(200).fill('x()');
        lines[100] = 'findAge()';
        const doc = makeDoc(lines);
        assert.equal(reAnchorToken(doc, 0, 'findAge', 10), 0);
    });

    it('finds token at exact radius boundary', () => {
        const lines = Array(60).fill('x()');
        lines[50] = 'findAge()'; // exactly 50 lines away from 0
        const doc = makeDoc(lines);
        assert.equal(reAnchorToken(doc, 0, 'findAge', 50), 50);
    });

    it('clamps lo/hi to document bounds without throwing', () => {
        const doc = makeDoc(['findAge()']); // single-line doc
        assert.equal(reAnchorToken(doc, 0, 'findAge', 50), 0);
    });

    it('handles empty document gracefully', () => {
        const doc = makeDoc([]);
        // nominalLine 0 is out of bounds — should not throw, returns 0
        assert.doesNotThrow(() => reAnchorToken(doc, 0, 'findAge', 5));
    });
});
