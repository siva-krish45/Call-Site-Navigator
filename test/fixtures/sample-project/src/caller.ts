import { findAge, helperFn } from './utils';

// Call site 1 — line 3
const age1 = findAge(1990);

// Call site 2 — line 6
const age2 = findAge(1985);

// Call site 3 — line 9
const age3 = findAge(2000);

// Same-file helper — helperFn defined below
function localFn(): string {
    // Call site 4 (same file) — line 14
    return helperFn();
}

export { age1, age2, age3, localFn };
