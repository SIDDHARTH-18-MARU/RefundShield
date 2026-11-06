import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
  type ReactNode,
} from 'react';
import { SCENARIOS } from './workspace';
import type { ScenarioId } from '../types/models';

type Theme = 'light' | 'dark';
export interface Toast { id: number; title: string; detail?: string; tone?: 'info' | 'success' | 'warn' }

/** One synthetic action recorded in this tab.
 * Not a durable or legally authoritative audit trail. */
export interface LogEntry {
  id: number;
  at: string;            // ISO timestamp
  subject: string;       // return id / cluster id / page
  action: string;
  detail?: string;
}

interface AppState {
  scenario: ScenarioId;
  setScenario: (s: ScenarioId) => void;
  theme: Theme;
  toggleTheme: () => void;
  reduceMotion: boolean;
  setReduceMotion: (v: boolean) => void;
  toasts: Toast[];
  pushToast: (t: Omit<Toast, 'id'>) => void;
  dismissToast: (id: number) => void;
  paletteOpen: boolean;
  setPaletteOpen: (v: boolean) => void;
  demoMode: boolean;
  setDemoMode: (v: boolean) => void;
  log: LogEntry[];
  logEvent: (e: Omit<LogEntry, 'id' | 'at'>) => void;
  clearLog: (subject?: string) => void;
}

const Ctx = createContext<AppState | null>(null);
const KEY_THEME = 'refundshield.theme';
const KEY_SCENARIO = 'refundshield.scenario';
const KEY_LOG = 'refundshield.session-log.v1';

function readStored<T extends string>(key: string, fallback: T): T {
  try {
    const value = sessionStorage.getItem(key);
    if (key === KEY_SCENARIO) return (SCENARIOS.includes(value as ScenarioId) ? value : fallback) as T;
    return (value === 'light' || value === 'dark' ? value : fallback) as T;
  } catch {
    return fallback;
  }
}

function readLogs(): Record<string, LogEntry[]> {
  try {
    const raw = sessionStorage.getItem(KEY_LOG);
    if (!raw || raw.length > 150000) return {};
    const parsed = JSON.parse(raw);
    if (parsed.version !== 1 || !parsed.logs) return {};
    return Object.fromEntries(SCENARIOS.map(s => [s, Array.isArray(parsed.logs[s])
      ? parsed.logs[s].filter((e: LogEntry) => e && Number.isFinite(e.id)
        && typeof e.at === 'string' && !Number.isNaN(Date.parse(e.at))
        && typeof e.subject === 'string' && e.subject.length <= 64
        && typeof e.action === 'string' && e.action.length <= 80
        && (e.detail === undefined || typeof e.detail === 'string' && e.detail.length <= 200)).slice(-60)
      : []]));
  } catch { return {}; }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [scenario, setScenarioRaw] = useState<ScenarioId>(
    () => readStored<ScenarioId>(KEY_SCENARIO, 'coordinated'));
  const [theme, setTheme] = useState<Theme>(() => readStored<Theme>(KEY_THEME, 'light'));
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [demoMode, setDemoModeRaw] = useState(false);
  const [logs, setLogs] = useState<Record<string, LogEntry[]>>(readLogs);
  const log = logs[scenario] ?? [];
  const [reduceMotion, setReduceMotionRaw] = useState(() => {
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    root.style.colorScheme = theme;
    try { sessionStorage.setItem(KEY_THEME, theme); } catch { /* private mode */ }
  }, [theme]);

  useEffect(() => {
    document.documentElement.classList.toggle('reduce-motion', reduceMotion);
  }, [reduceMotion]);

  useEffect(() => {
    try { sessionStorage.setItem(KEY_SCENARIO, scenario); } catch { /* private mode */ }
  }, [scenario]);

  useEffect(() => {
    try { sessionStorage.setItem(KEY_LOG, JSON.stringify({ version: 1, logs })); }
    catch { /* private mode or quota */ }
  }, [logs]);

  const pushToast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev.slice(-3), { ...t, id }]);
    window.setTimeout(() => setToasts((p) => p.filter((x) => x.id !== id)), 4200);
  }, []);

  const dismissToast = useCallback(
    (id: number) => setToasts((p) => p.filter((x) => x.id !== id)), []);

  const logEvent = useCallback((e: Omit<LogEntry, 'id' | 'at'>) => {
    setLogs(prev => ({ ...prev, [scenario]: [...(prev[scenario] ?? []).slice(-59), {
      subject: e.subject.slice(0, 64), action: e.action.slice(0, 80), detail: e.detail?.slice(0, 200),
      id: Date.now() + Math.random(), at: new Date().toISOString(),
    }] }));
  }, [scenario]);

  const clearLog = useCallback((subject?: string) => {
    setLogs(prev => ({ ...prev, [scenario]: subject ? (prev[scenario] ?? []).filter(e => e.subject !== subject) : [] }));
  }, [scenario]);

  const setScenario = useCallback((s: ScenarioId) => { if (SCENARIOS.includes(s)) setScenarioRaw(s); }, []);
  const setDemoMode = useCallback((v: boolean) => setDemoModeRaw(v), []);
  const toggleTheme = useCallback(
    () => setTheme((t) => (t === 'light' ? 'dark' : 'light')), []);

  const value = useMemo<AppState>(() => ({
    scenario, setScenario, theme, toggleTheme,
    reduceMotion, setReduceMotion: setReduceMotionRaw,
    toasts, pushToast, dismissToast, paletteOpen, setPaletteOpen,
    demoMode, setDemoMode, log, logEvent, clearLog,
  }), [scenario, setScenario, theme, toggleTheme, reduceMotion,
       toasts, pushToast, dismissToast, paletteOpen,
       demoMode, setDemoMode, log, logEvent, clearLog]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be used inside <AppProvider>');
  return v;
}
