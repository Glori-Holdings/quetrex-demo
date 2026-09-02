export type Clock = () => string;
export type IdGenerator = () => string;

/** Default clock: wall-clock ISO timestamps. The sole permitted call site for Date. */
export function createSystemClock(): Clock {
  return () => new Date().toISOString();
}

/** Default id generator: random UUIDs. The sole permitted call site for crypto.randomUUID. */
export function createRandomIdGenerator(): IdGenerator {
  return () => crypto.randomUUID();
}
