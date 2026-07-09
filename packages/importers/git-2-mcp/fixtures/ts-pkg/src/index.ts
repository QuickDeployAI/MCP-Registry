export function add(left: number, right: number): number {
  return left + right;
}

export function slugify(value: string): string {
  return value.trim().toLowerCase().split(/\s+/g).join("-");
}

export function summarize(items: string[]): { count: number; characters: number } {
  return { count: items.length, characters: items.reduce((total, item) => total + item.length, 0) };
}

function privateHelper(): string {
  return "hidden";
}
