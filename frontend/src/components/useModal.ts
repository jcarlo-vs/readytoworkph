'use client';
import { useEffect, useRef } from 'react';

// Shows a native <dialog> as a modal while `open` is true. Every modal on the site goes through this.
// Next keeps visited pages alive in the background (back/forward), so when the page is hidden or
// unmounted the dialog is closed and `onClose` resets the owner's state: no modal survives a page change.
export function useModal(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  const latestOnClose = useRef(onClose);
  useEffect(() => { latestOnClose.current = onClose; });

  useEffect(() => {
    const d = ref.current;
    if (open && d && !d.open) d.showModal();
    if (!open && d?.open) d.close();
  }, [open]);

  useEffect(() => () => {
    ref.current?.close();
    latestOnClose.current();
  }, []);

  return ref;
}
