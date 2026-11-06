import { useState, useSyncExternalStore } from 'react';
import { workspace } from '../../state/workspace';
import { useApp } from '../../state/AppContext';
import { SCENARIO_SHORT } from '../../lib/format';

export function WorkspaceNotice() {
  const { scenario, clearLog, pushToast } = useApp();
  const [confirming, setConfirming] = useState<string | null>(null);
  useSyncExternalStore(workspace.subscribe, workspace.snapshot);
  const warning = workspace.warning();
  return (
    <section aria-label="Synthetic workspace" className="border-b border-hairline bg-raised px-4 py-2 text-xs text-fg2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 basis-full sm:basis-0 sm:flex-1"><strong>Synthetic demo.</strong> Read-only analysis; actions and notes stay in this tab. No payments or real refunds. Do not enter real customer data.</p>
        {confirming === scenario ? (
          <div className="flex flex-wrap items-center gap-2">
            <span>Reset {SCENARIO_SHORT[scenario]} notes, actions and history?</span>
            <button className="btn text-xs" onClick={() => {
              workspace.reset(scenario); clearLog(); setConfirming(null);
              pushToast({ title: 'Scenario workspace reset', detail: 'Synthetic analysis scores are unchanged.' });
            }}>Confirm reset</button>
            <button className="btn text-xs" onClick={() => setConfirming(null)}>Cancel reset</button>
          </div>
        ) : <button className="btn text-xs" onClick={() => setConfirming(scenario)}>Reset scenario workspace</button>}
      </div>
      {warning && <p role="status" className="mt-1 font-medium">{warning}</p>}
    </section>
  );
}
