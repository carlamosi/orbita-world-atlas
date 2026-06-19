/** Cheap normalized comparison + Levenshtein for fuzzy country name match. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const dp = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) dp[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(
        dp[j] + 1,
        dp[j - 1] + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      prev = tmp;
    }
  }
  return dp[b.length];
}

export function fuzzyMatch(guess: string, target: string, alts: string[] = []): boolean {
  const g = normalize(guess);
  if (!g) return false;
  const candidates = [target, ...alts].map(normalize).filter(Boolean);
  for (const c of candidates) {
    if (g === c) return true;
    const tol = Math.max(1, Math.floor(c.length / 8));
    if (levenshtein(g, c) <= tol) return true;
  }
  return false;
}

/** Strict normalized equality — used for instant typing validation. */
export function exactMatch(guess: string, target: string, alts: string[] = []): boolean {
  const g = normalize(guess);
  if (!g) return false;
  const candidates = [target, ...alts].map(normalize).filter(Boolean);
  return candidates.includes(g);
}
