import * as vscode from 'vscode';
import { CallSite } from './types';

const MAX_STACK_DEPTH = 50;

// LIFO stacks per document URI
const callSiteStacks = new Map<string, CallSite[]>();

// The most recently popped CallSite per document URI (used for empty-stack toggle forward)
const lastPoppedSites = new Map<string, CallSite>();

export function pushCallSite(cs: CallSite): void {
    const key = cs.uri.toString();

    // Clear last popped site since a new navigation chain is starting
    lastPoppedSites.delete(key);

    if (!callSiteStacks.has(key)) {
        callSiteStacks.set(key, []);
    }
    const stack = callSiteStacks.get(key)!;

    // Dedup: if the top of the stack is identical, skip pushing
    const top = stack[stack.length - 1];
    if (
        top &&
        top.line === cs.line &&
        top.token === cs.token
    ) {
        return;
    }

    if (stack.length >= MAX_STACK_DEPTH) {
        stack.shift(); // evict oldest to cap memory
    }
    stack.push(cs);
}

export function popCallSite(uri: string): CallSite | undefined {
    const stack = callSiteStacks.get(uri);
    if (stack) {
        const cs = stack.pop();
        if (stack.length === 0) {
            callSiteStacks.delete(uri);
        }
        if (cs) {
            lastPoppedSites.set(uri, cs);
        }
        return cs;
    }
    return undefined;
}

export function peekCallSite(uri: string): CallSite | undefined {
    return callSiteStacks.get(uri)?.at(-1);
}

export function getLastPopped(uri: string): CallSite | undefined {
    return lastPoppedSites.get(uri);
}

export function clearLastPopped(uri: string): void {
    lastPoppedSites.delete(uri);
}

export function pushLastPoppedBack(uri: string, cs: CallSite): void {
    if (!callSiteStacks.has(uri)) {
        callSiteStacks.set(uri, []);
    }
    callSiteStacks.get(uri)!.push(cs);
    lastPoppedSites.delete(uri);
}

/** Human-readable dump of the entire store — for the diagnostics command. */
export function dumpState(): string {
    const lines: string[] = [];
    lines.push(`callSiteStacks: ${callSiteStacks.size} file(s)`);
    for (const [key, stack] of callSiteStacks) {
        lines.push(`  ${key}  (${stack.length} call site${stack.length === 1 ? '' : 's'})`);
        for (const p of stack) {
            lines.push(`    "${p.token}" line:${p.line}`);
        }
    }
    lines.push(`lastPoppedSites: ${lastPoppedSites.size} entry(ies)`);
    for (const [key, p] of lastPoppedSites) {
        lines.push(`  ${key} -> "${p.token}" line:${p.line} (defLine:${p.definitionLine ?? 'none'})`);
    }
    return lines.join('\n');
}

export function evictDocument(uri: string): void {
    callSiteStacks.delete(uri);
    lastPoppedSites.delete(uri);
}

export function clearAll(): void {
    callSiteStacks.clear();
    lastPoppedSites.clear();
}

// Exposed for unit tests only
export function _getStack(uri: string): CallSite[] | undefined {
    return callSiteStacks.get(uri);
}

export function _getLastPoppedMap(): Map<string, CallSite> {
    return lastPoppedSites;
}
