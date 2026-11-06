import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorkspace, WORKSPACE_KEY, NOTE_LIMIT, CASE_LIMIT, HISTORY_LIMIT } from '../state/workspace';

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return { getItem: k => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); },
    removeItem: k => { data.delete(k); }, clear: () => data.clear(),
    get length() { return data.size; }, key: i => [...data.keys()][i] ?? null };
}

describe('bounded local synthetic workspace', () => {
  it('isolates scenarios, visitors and reloads; reset affects only selected scenario', () => {
    const storage = memoryStorage(), other = memoryStorage();
    const a = createWorkspace(() => storage), b = createWorkspace(() => other);
    a.update('coordinated', 'RET-7137', 'synthetic device checked', 'escalate');
    a.update('household', 'RET-7137', 'benign shared household', 'review');
    expect(b.get('coordinated', 'RET-7137').status).toBe('Awaiting review');
    expect(a.get('normal', 'RET-7137').notes).toBe('');
    const reloaded = createWorkspace(() => storage);
    expect(reloaded.get('coordinated', 'RET-7137').status).toBe('Escalated for investigation');
    reloaded.reset('coordinated');
    expect(reloaded.get('coordinated', 'RET-7137').notes).toBe('');
    expect(reloaded.get('household', 'RET-7137').notes).toBe('benign shared household');
  });
  it('validates actions, IDs, scenarios and note lengths without mutating on failure', () => {
    const store = createWorkspace(memoryStorage);
    expect(() => store.update('coordinated', 'RET-1', '', 'deny')).toThrow();
    expect(() => store.update('coordinated', '../escape', '', 'review')).toThrow();
    expect(() => store.update('unknown' as never, 'RET-1', '', 'review')).toThrow();
    expect(() => store.update('coordinated', 'RET-1', 'x'.repeat(NOTE_LIMIT + 1))).toThrow();
    expect(store.get('coordinated', 'RET-1').history).toEqual([]);
  });
  it('caps retained cases/history and returns defensive copies', () => {
    const storage = memoryStorage(), store = createWorkspace(() => storage);
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) store.update('normal', 'RET-0', '', 'review');
    const copy = store.get('normal', 'RET-0');
    expect(copy.history).toHaveLength(HISTORY_LIMIT);
    copy.notes = 'outside mutation';
    expect(store.get('normal', 'RET-0').notes).toBe('');
    for (let i = 1; i < CASE_LIMIT; i++) store.update('normal', `RET-${i}`, '');
    expect(() => store.update('normal', 'RET-OVERFLOW', '')).toThrow(/full/);
  });
  it.each(['{invalid', '{"version":99,"cases":{}}', '{"version":1,"cases":[]}',
    '{"version":1,"cases":{"coordinated:RET-1":{"status":"fraud","notes":"","history":[]}}}'])
  ('recovers corrupt/schema-invalid storage: %s', raw => {
    const storage = memoryStorage(); storage.setItem(WORKSPACE_KEY, raw);
    const store = createWorkspace(() => storage);
    expect(store.get('normal', 'RET-1').status).toBe('Awaiting review');
    expect(store.warning()).toMatch(/could not be read/);
    store.reset('normal');
    expect(store.warning()).toBe('');
  });
  it('preserves in-memory actions when storage is unavailable/full', () => {
    const store = createWorkspace(() => { throw new Error('blocked'); });
    store.update('normal', 'RET-1', '<script>literal synthetic text</script>', 'review');
    expect(store.get('normal', 'RET-1').status).toBe('In review');
    expect(store.warning()).toMatch(/in memory/);
  });
});

describe('real API adapter with local case overlays', () => {
  beforeEach(() => { vi.resetModules(); sessionStorage.clear(); });
  it('uses only GET, updates queue/dashboard, reloads notes and rejects missing records', async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.includes('RET-MISSING')) return new Response('{}', { status: 404 });
      const body = url.includes('/dashboard') ? { totals: { return_requests: 2 }, cards: [] }
        : url.includes('/investigation-queue') ? { queue: [{ return_id: 'RET-1', status: 'Awaiting review' }, { return_id: 'RET-2', status: 'Awaiting review' }] }
        : { return: { return_id: 'RET-1' }, case_state: { status: 'Awaiting review', notes: '', history: [] } };
      return new Response(JSON.stringify(body));
    });
    vi.stubGlobal('fetch', fetcher);
    const { api } = await import('../services/api');
    await api.applyAction('RET-1', 'coordinated', 'escalate', 'synthetic check');
    expect((await api.queue('coordinated')).queue[0].status).toBe('Escalated for investigation');
    expect((await api.dashboard('coordinated')).totals.reviewed).toBe(1);
    expect((await api.dashboard('household')).totals.reviewed).toBe(0);
    await api.saveNotes('RET-1', 'coordinated', 'new synthetic note');
    expect((await api.investigation('RET-1', 'coordinated')).case_state.notes).toBe('new synthetic note');
    await expect(api.applyAction('RET-MISSING', 'coordinated', 'review')).rejects.toThrow();
    for (const [, options] of fetcher.mock.calls as unknown as [string, RequestInit][]) expect(options.method).not.toBe('POST');
    vi.unstubAllGlobals();
  });
});
