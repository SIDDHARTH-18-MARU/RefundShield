import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { workspace } from '../state/workspace';
import { ApiError } from '../services/api';
import { useApp } from '../state/AppContext';

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/** Runs an async loader, cancels stale responses, and exposes a retry. */
export function useAsync<T>(loader: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const revision = useSyncExternalStore(workspace.subscribe, workspace.snapshot);
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const alive = useRef(0);

  useEffect(() => {
    const token = ++alive.current;
    setData(null);
    setLoading(true);
    setError(null);
    loader()
      .then((d) => { if (alive.current === token) { setData(d); setLoading(false); } })
      .catch((e: unknown) => {
        if (alive.current !== token) return;
        setError(e instanceof ApiError ? e.message : 'Something went wrong loading this view.');
        setLoading(false);
      });
    return () => { alive.current++; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce, revision]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, loading, error, reload };
}

/** Display computed values immediately; animation must never show a false score. */
export function useCountUp(target: number, _duration = 900, decimals = 0): number {
  return decimals ? Number(target.toFixed(decimals)) : Math.round(target);
}

/** Fires once when the element first scrolls into view. */
export function useInView<T extends HTMLElement>(margin = '-12% 0px') {
  const ref = useRef<T | null>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver === 'undefined') { setSeen(true); return; }
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect(); } },
      { rootMargin: margin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen, margin]);
  return { ref, seen } as const;
}

export function useDebounced<T>(value: T, ms = 220): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
