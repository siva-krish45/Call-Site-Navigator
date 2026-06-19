// Shared mutable object — safe across CommonJS compiled modules.
// Direct `export let` would snapshot to false at import time in CJS.
export const jumpState = {
    isExecuting: false,
};
