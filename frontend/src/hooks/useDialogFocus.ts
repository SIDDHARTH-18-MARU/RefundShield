import { useEffect, useRef } from 'react';

/** Focus containment/restoration for the existing custom dialogs. */
export function useDialogFocus(open: boolean, label: string, close: () => void) {
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]'))
      .find(el => el.getAttribute('aria-label') === label);
    if (!dialog) return;
    dialog.setAttribute('aria-modal', 'true');
    const elements = () => Array.from(dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]',
    )).filter(el => !el.hidden && !el.closest('[hidden],[inert]') && el.tabIndex >= 0
      && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden');
    elements()[0]?.focus();
    const key = (event: KeyboardEvent) => {
      const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
      if (dialogs[dialogs.length - 1] !== dialog) return;
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); }
      if (event.key === 'Tab') {
        const items = elements();
        // Explicitly cycle every Tab step. WebKit's native tab preference may
        // skip links/buttons and otherwise move to a control behind the modal.
        event.preventDefault();
        if (!items.length) return;
        const index = items.indexOf(document.activeElement as HTMLElement);
        const next = index < 0 ? (event.shiftKey ? items.length - 1 : 0)
          : (index + (event.shiftKey ? -1 : 1) + items.length) % items.length;
        items[next].focus();
      }
    };
    document.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('keydown', key, true); previous?.focus(); };
  }, [open, label]);
}
