/** Date-key helpers — all in local time, "YYYY-MM-DD". */

export function dateKey(ts: number = Date.now()): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function weekKey(ts: number = Date.now()): string {
  const d = new Date(ts);
  // ISO week
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const diff = (target.getTime() - firstThursday.getTime()) / 86_400_000;
  const week = 1 + Math.round((diff - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function prevDateKey(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y!, m! - 1, d! - 1);
  return dateKey(date.getTime());
}

/**
 * Compute current streak: count back from today, allowing today to be absent
 * if yesterday is present. Stops at first gap.
 */
export function currentStreak(activeDays: Set<string>, today = dateKey()): number {
  let cursor = today;
  if (!activeDays.has(cursor)) cursor = prevDateKey(cursor);
  let count = 0;
  while (activeDays.has(cursor)) {
    count++;
    cursor = prevDateKey(cursor);
  }
  return count;
}

export function longestStreak(activeDays: Set<string>): number {
  if (activeDays.size === 0) return 0;
  const sorted = [...activeDays].sort();
  let best = 1;
  let cur = 1;
  for (let i = 1; i < sorted.length; i++) {
    if (prevDateKey(sorted[i]!) === sorted[i - 1]) {
      cur++;
      best = Math.max(best, cur);
    } else {
      cur = 1;
    }
  }
  return best;
}
