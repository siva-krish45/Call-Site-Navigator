import * as vscode from 'vscode';
import { CallSitePair } from './types';

const MAX_STACK_DEPTH = 50;

// Primary index: callSiteUri → LIFO stack of pairs
const callSiteStacks = new Map<string, CallSitePair[]>();

// Reverse index: definitionUri → most recent pair (cross-file jump-back lookup)
// NOT populated when callSiteUri === definitionUri (same-file navigation)
const definitionIndex = new Map<string, CallSitePair>();

// Monotonic recency counter. Each push gets the next value so we can compare
// "which pair is more recent" across the two indexes.
let seqCounter = 0;

export function pushPair(pair: CallSitePair): void {
    const callKey = pair.callSiteUri.toString();

    if (!callSiteStacks.has(callKey)) {
        callSiteStacks.set(callKey, []);
    }
    const stack = callSiteStacks.get(callKey)!;

    // Dedup: if the top of the stack already describes this exact call-site →
    // definition jump, refresh it in place instead of stacking a duplicate.
    // Guards against double-capture (F12 command + active-editor listener) and
    // repeated navigation from the same site.
    const top = stack[stack.length - 1];
    if (
        top &&
        top.callSiteUri.toString() === pair.callSiteUri.toString() &&
        top.callSiteLine === pair.callSiteLine &&
        top.callSiteToken === pair.callSiteToken &&
        top.definitionUri.toString() === pair.definitionUri.toString() &&
        top.definitionLine === pair.definitionLine
    ) {
        top.toggleTarget = null;     // fresh navigation resets the toggle
        top.seq = ++seqCounter;      // ...and makes it the most-recent pair again
        if (pair.callSiteUri.toString() !== pair.definitionUri.toString()) {
            definitionIndex.set(pair.definitionUri.toString(), top);
        }
        return;
    }

    if (stack.length >= MAX_STACK_DEPTH) {
        stack.shift(); // evict oldest to cap memory
    }
    pair.seq = ++seqCounter;
    stack.push(pair);

    // Skip reverse index for same-file pairs — avoids ambiguous URI lookup
    if (pair.callSiteUri.toString() !== pair.definitionUri.toString()) {
        definitionIndex.set(pair.definitionUri.toString(), pair);
    }
}

export function getActivePair(activeUri: string): CallSitePair | undefined {
    // A file can be BOTH a cross-file definition target and a same-file call site.
    // Resolve the conflict by recency: return whichever pair was navigated most
    // recently. This makes a fresh same-file jump win over a stale cross-file one
    // (and vice-versa).
    const crossFile = definitionIndex.get(activeUri);          // active file is a definition
    const sameOrCall = callSiteStacks.get(activeUri)?.at(-1);  // active file is a call site

    if (crossFile && sameOrCall) {
        return (sameOrCall.seq ?? 0) >= (crossFile.seq ?? 0) ? sameOrCall : crossFile;
    }
    return crossFile ?? sameOrCall;
}

/**
 * Looser lookup used by jump-back: tries the precise indexes first, then scans
 * every stack for the most-recent pair that touches this URI (as either the
 * definition or the call site). This rescues cases where the active URI does not
 * exactly match the stored definition URI (e.g. a definition opened in a peek or
 * a slightly different scheme).
 */
export function findPairLoose(activeUri: string): CallSitePair | undefined {
    const direct = getActivePair(activeUri);
    if (direct) return direct;

    let newest: CallSitePair | undefined;
    for (const stack of callSiteStacks.values()) {
        for (let i = stack.length - 1; i >= 0; i--) {
            const p = stack[i];
            if (
                p.definitionUri.toString() === activeUri ||
                p.callSiteUri.toString() === activeUri
            ) {
                return p; // most-recent within this stack
            }
        }
        const t = stack[stack.length - 1];
        if (t) newest = t;
    }
    return newest;
}

/** Human-readable dump of the entire store — for the diagnostics command. */
export function dumpState(): string {
    const lines: string[] = [];
    lines.push(`callSiteStacks: ${callSiteStacks.size} file(s)`);
    for (const [key, stack] of callSiteStacks) {
        lines.push(`  ${key}  (${stack.length} pair${stack.length === 1 ? '' : 's'})`);
        for (const p of stack) {
            lines.push(`    "${p.callSiteToken}" ${p.callSiteUri.fsPath}:${p.callSiteLine} → ${p.definitionUri.fsPath}:${p.definitionLine}${p.toggleTarget ? ' [toggle armed]' : ''}`);
        }
    }
    lines.push(`definitionIndex: ${definitionIndex.size} entry(ies)`);
    for (const key of definitionIndex.keys()) {
        lines.push(`  ${key}`);
    }
    return lines.join('\n');
}

export function popPair(pair: CallSitePair): void {
    const stack = callSiteStacks.get(pair.callSiteUri.toString());
    if (stack) {
        const idx = stack.lastIndexOf(pair);
        if (idx !== -1) stack.splice(idx, 1);
        if (stack.length === 0) {
            callSiteStacks.delete(pair.callSiteUri.toString());
        }
    }
    definitionIndex.delete(pair.definitionUri.toString());
}

export function evictDocument(uri: string): void {
    // Remove all pairs where this document is the call site
    callSiteStacks.delete(uri);
    // Remove any pair where this document is the definition
    definitionIndex.delete(uri);
}

export function clearAll(): void {
    callSiteStacks.clear();
    definitionIndex.clear();
    seqCounter = 0;
}

// Exposed for unit tests only
export function _getStack(uri: string): CallSitePair[] | undefined {
    return callSiteStacks.get(uri);
}

export function _getDefinitionIndex(): Map<string, CallSitePair> {
    return definitionIndex;
}
