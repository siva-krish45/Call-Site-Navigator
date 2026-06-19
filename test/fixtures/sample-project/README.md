# Integration Test Fixture

This is the workspace opened by the integration test runner. Do not use it for manual development.

## Files

| File | Purpose |
|---|---|
| `src/caller.ts` | Contains three cross-file call sites for `findAge()` and one same-file call site for `helperFn()` |
| `src/utils.ts` | Implements `findAge()` and `helperFn()` — these are the definition targets |

## Known line numbers (0-indexed)

Tests reference these constants directly. If you edit these files, update the constants in `test/integration/jumpBack.integration.test.ts`:

```typescript
const CALL_SITE_LINE = 3;   // findAge(1990) in caller.ts
const DEFINITION_LINE = 1;  // findAge implementation body in utils.ts
```
