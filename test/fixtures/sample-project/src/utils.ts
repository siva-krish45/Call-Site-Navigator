export function findAge(birthYear: number): number {
    return new Date().getFullYear() - birthYear;
}

export function helperFn(): string {
    return 'helper';
}
