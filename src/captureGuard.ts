// Shared mutable flag (CJS-safe, same pattern as jumpState/pendingState).
// Set while the F12 command performs its own synchronous capture, so the
// active-editor listener does not ALSO create a pair for the same navigation.
export const captureGuard: { suppress: boolean } = { suppress: false };
