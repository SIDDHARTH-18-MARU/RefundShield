import type { CaseState, ScenarioId } from '../types/models';

export const WORKSPACE_KEY = 'refundshield.workspace.v1';
export const NOTE_LIMIT = 2000;
export const CASE_LIMIT = 100;
export const HISTORY_LIMIT = 60;
export const SCENARIOS: ScenarioId[] = ['normal', 'household', 'isolated', 'coordinated'];
export const ACTIONS = {
  review: { status: 'In review', label: 'Review Evidence' },
  request_evidence: { status: 'More evidence requested', label: 'Request More Evidence' },
  approve_refund: { status: 'Refund approved', label: 'Approve Refund (simulation)' },
  escalate: { status: 'Escalated for investigation', label: 'Escalate for Investigation' },
} as const;
export const LOCAL_NOTICE = 'Local simulation only — no refund, payment or evidence request is sent. Use synthetic notes only.';
type Cases = Record<string, CaseState>;
interface Saved { version: 1; cases: Cases }
const validScenario = (s: string): s is ScenarioId => SCENARIOS.includes(s as ScenarioId);
const validId = (id: string) => /^[A-Z0-9_-]{1,64}$/.test(id);
const initial = (): CaseState => ({ status: 'Awaiting review', notes: '', history: [], notice: LOCAL_NOTICE });
const statuses = ['Awaiting review', ...Object.values(ACTIONS).map(a => a.status)];

/** Bounded per-tab synthetic workspace; never a server identity or authoritative log. */
export function createWorkspace(storage: () => Storage | undefined) {
  let cases: Cases = {};
  let revision = 0;
  let loaded = false;
  let warning = '';
  const listeners = new Set<() => void>();
  function load() {
    if (loaded) return;
    loaded = true;
    try {
      const raw = storage()?.getItem(WORKSPACE_KEY);
      if (!raw) return;
      if (raw.length > 600000) throw new Error('size');
      const saved = JSON.parse(raw) as Saved;
      if (saved.version !== 1 || !saved.cases || typeof saved.cases !== 'object' || Array.isArray(saved.cases)) throw new Error('schema');
      const entries = Object.entries(saved.cases);
      if (entries.length > CASE_LIMIT) throw new Error('cases');
      const clean: Cases = {};
      for (const [key, value] of entries) {
        const [scenario, id, extra] = key.split(':');
        if (extra || !validScenario(scenario) || !validId(id) || !value || !statuses.includes(value.status)
            || typeof value.notes !== 'string' || value.notes.length > NOTE_LIMIT
            || !Array.isArray(value.history) || value.history.length > HISTORY_LIMIT) throw new Error('case');
        if (!value.history.every(h => h && Object.hasOwn(ACTIONS, h.action)
            && h.status === ACTIONS[h.action as keyof typeof ACTIONS].status
            && typeof h.label === 'string' && h.label.length <= 80)) throw new Error('history');
        clean[key] = { status: value.status, notes: value.notes, history: value.history.map(h => ({
          action: h.action, status: h.status, label: ACTIONS[h.action as keyof typeof ACTIONS].label,
        })), notice: LOCAL_NOTICE };
      }
      cases = clean;
    } catch {
      cases = {};
      warning = 'Saved workspace could not be read. A clean in-memory workspace is available; reset to recover storage.';
    }
  }
  function changed(next: Cases) {
    const encoded = JSON.stringify({ version: 1, cases: next });
    if (encoded.length > 600000) throw new Error('Workspace full. Reset a scenario to free space.');
    cases = next;
    try {
      const target = storage();
      if (!target) throw new Error('unavailable');
      target.setItem(WORKSPACE_KEY, encoded);
      warning = '';
    } catch {
      warning = 'Browser storage is unavailable or full. Changes work in memory and may be lost on reload.';
    }
    revision++;
    listeners.forEach(fn => fn());
  }
  function key(s: ScenarioId, id: string) {
    if (!validScenario(s) || !validId(id)) throw new Error('Invalid synthetic case');
    return `${s}:${id}`;
  }
  return {
    subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
    snapshot: () => revision,
    warning: () => { load(); return warning; },
    get(s: ScenarioId, id: string): CaseState {
      load();
      return structuredClone(cases[key(s, id)] ?? initial());
    },
    update(s: ScenarioId, id: string, note: string | undefined, action?: string): CaseState {
      load();
      const k = key(s, id);
      if (note !== undefined && (typeof note !== 'string' || note.length > NOTE_LIMIT)) throw new Error('Notes must be at most 2000 characters');
      if (action !== undefined && !Object.hasOwn(ACTIONS, action)) throw new Error('Unsupported local action');
      if (!cases[k] && Object.keys(cases).length >= CASE_LIMIT) throw new Error('Workspace full. Reset a scenario before adding more cases.');
      const state = structuredClone(cases[k] ?? initial());
      if (note !== undefined) state.notes = note;
      if (action) {
        const entry = ACTIONS[action as keyof typeof ACTIONS];
        state.status = entry.status;
        state.history = [...state.history, { action, ...entry }].slice(-HISTORY_LIMIT);
      }
      changed({ ...cases, [k]: state });
      return structuredClone(state);
    },
    reset(s: ScenarioId) {
      load();
      if (!validScenario(s)) throw new Error('Invalid scenario');
      changed(Object.fromEntries(Object.entries(cases).filter(([k]) => !k.startsWith(`${s}:`))));
    },
  };
}

export const workspace = createWorkspace(() => window.sessionStorage);
