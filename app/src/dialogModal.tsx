/**
 * Modal base (SUB200 split of dialogs.tsx — no behavior change): role="dialog",
 * aria-modal, Esc closes, initial focus inside, backdrop pointer-down closes,
 * focus trapped inside the dialog (Tab/Shift+Tab cycle).
 * dialogs.tsx stays the facade with the dialog contract list.
 */

import React, { useCallback, useEffect, useRef } from "react";

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]):not([disabled])';

export function Modal(props: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  testId?: string;
}): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.stopPropagation(); props.onClose(); return; }
    // focus trap: cycle Tab/Shift+Tab within the dialog
    if (e.key === "Tab" && ref.current) {
      const focusable = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    }
  }, [props.onClose]);

  return (
    <div className="modal-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) props.onClose(); }}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={props.title}
        data-testid={props.testId}
        tabIndex={-1}
        ref={ref}
        onKeyDown={handleKeyDown}
      >
        <div className="modal-head">
          <b>{props.title}</b>
          <button type="button" className="modal-close" aria-label="close dialog" onClick={props.onClose}>✕</button>
        </div>
        <div className="modal-body">{props.children}</div>
      </div>
    </div>
  );
}
