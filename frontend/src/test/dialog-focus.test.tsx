import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { useDialogFocus } from '../hooks/useDialogFocus';

function Harness() {
  const [open, setOpen] = useState(false);
  useDialogFocus(open, 'Test navigation', () => setOpen(false));
  return <>
    <button onClick={() => setOpen(true)}>Open dialog</button>
    <button>Outside control</button>
    {open && <section role="dialog" aria-label="Test navigation">
      <button onClick={() => setOpen(false)}>Close dialog</button>
      <a href="#inside">Inside link</a>
      <select aria-label="Inside select"><option>One</option></select>
      <input aria-label="Inside input" />
      <button disabled>Disabled control</button>
      <a href="#hidden" hidden>Hidden control</a>
    </section>}
  </>;
}

async function open() {
  render(<Harness />);
  await userEvent.click(screen.getByRole('button', { name: 'Open dialog' }));
}

describe('modal focus containment across browser tab preferences', () => {
  it('cycles links, select and input explicitly in both directions', async () => {
    await open();
    const close = screen.getByRole('button', { name: 'Close dialog' });
    expect(close).toHaveFocus();
    for (const item of [screen.getByRole('link', { name: 'Inside link' }), screen.getByLabelText('Inside select'), screen.getByLabelText('Inside input'), close]) {
      fireEvent.keyDown(document.activeElement!, { key: 'Tab', cancelable: true });
      expect(item).toHaveFocus();
    }
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true, cancelable: true });
    expect(screen.getByLabelText('Inside input')).toHaveFocus();
  });

  it('recovers focus from outside without allowing a native tab escape', async () => {
    await open();
    screen.getByRole('button', { name: 'Outside control' }).focus();
    expect(fireEvent.keyDown(document.activeElement!, { key: 'Tab', cancelable: true })).toBe(false);
    expect(screen.getByRole('button', { name: 'Close dialog' })).toHaveFocus();
    screen.getByRole('button', { name: 'Outside control' }).focus();
    fireEvent.keyDown(document.activeElement!, { key: 'Tab', shiftKey: true, cancelable: true });
    expect(screen.getByLabelText('Inside input')).toHaveFocus();
  });

  it('supports Escape and restores the trigger focus', async () => {
    await open();
    fireEvent.keyDown(document.activeElement!, { key: 'Escape', cancelable: true });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open dialog' })).toHaveFocus();
  });
});
