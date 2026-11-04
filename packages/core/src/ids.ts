/** ULIDs: sortable by creation time, unique without coordination. */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

let lastTime = 0;
let lastRandom: number[] = [];

function randomDigits(): number[] {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b % 32);
}

export function ulid(now: number = Date.now()): string {
  let random: number[];
  if (now === lastTime) {
    // Same millisecond: increment the previous random part so ids stay monotonic.
    random = [...lastRandom];
    for (let i = random.length - 1; i >= 0; i--) {
      if (random[i]! < 31) {
        random[i]! += 1;
        break;
      }
      random[i] = 0;
    }
  } else {
    random = randomDigits();
  }
  lastTime = now;
  lastRandom = random;
  let time = "";
  let t = now;
  for (let i = 0; i < 10; i++) {
    time = ALPHABET[t % 32] + time;
    t = Math.floor(t / 32);
  }
  return time + random.map((d) => ALPHABET[d]).join("");
}

export type Id = string;

/** An id factory, injectable so tests get deterministic ids. */
export type IdFactory = () => Id;

export function sequentialIds(prefix = "id"): IdFactory {
  let n = 0;
  return () => `${prefix}${String(++n).padStart(4, "0")}`;
}
