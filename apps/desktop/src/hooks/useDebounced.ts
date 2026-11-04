import { useEffect, useState } from "react";

/** The value, settled for `ms` milliseconds. Keeps heavy derived work (prompt assembly) off drag frames. */
export function useDebounced<T>(value: T, ms = 150): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
