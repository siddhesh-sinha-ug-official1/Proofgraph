/**
 * Modal base (SUB200 split of dialogs.tsx — no behavior change): role="dialog",
 * aria-modal, Esc closes, initial focus inside, backdrop pointer-down closes.
 * dialogs.tsx stays the facade with the dialog contract list.
 */

import React, { useEffect, useRef } from "react";

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
        onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); props.onClose(); } }}
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
