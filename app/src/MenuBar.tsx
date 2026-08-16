/**
 * App-shell round — the accessible menubar (roles menubar/menu/menuitem,
 * arrow-key nav, Esc closes + focus returns to the menubar button).
 *
 * Honesty in chrome (contract): NO dead buttons — every item either carries a
 * live onAction or renders disabled with title="reason". Every activation is
 * probed (shell.menu.action); an activation attempt on a disabled item is a
 * probed no-fire (shell.menu.blocked), never a silent no-op.
 */

import React, { useEffect, useRef, useState } from "react";
import { probeShell } from "./shellLog";

export interface MenuItemSpec {
  id: string;
  label: string;
  shortcut?: string;
  enabled: boolean;
  /** REQUIRED when disabled — the visible title="why" (no dead buttons). */
  reason?: string;
  checked?: boolean;
  separatorBefore?: boolean;
  onAction?: () => void;
}

export interface MenuSpec {
  id: string;
  label: string;
  items: MenuItemSpec[];
}

export function MenuBar({ menus }: { menus: MenuSpec[] }): React.ReactElement {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [focusIdx, setFocusIdx] = useState(0);
  const barRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const itemRefs = useRef<Array<HTMLDivElement | null>>([]);

  const open = (id: string, idx = 0): void => {
    setOpenMenu(id);
    setFocusIdx(idx);
  };

  const close = (returnFocus: boolean): void => {
    const id = openMenu;
    setOpenMenu(null);
    if (returnFocus && id !== null) buttonRefs.current.get(id)?.focus();
  };

  // Close on outside click (pointerdown so a click landing elsewhere closes first).
  useEffect(() => {
    if (openMenu === null) return;
    const onDown = (e: PointerEvent): void => {
      if (barRef.current !== null && !barRef.current.contains(e.target as Node)) close(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openMenu]);

  // Focus the active menuitem whenever the open menu / focus index changes.
  useEffect(() => {
    if (openMenu !== null) itemRefs.current[focusIdx]?.focus();
  }, [openMenu, focusIdx]);

  const activate = (menu: MenuSpec, item: MenuItemSpec): void => {
    if (!item.enabled) {
      probeShell("shell.menu.blocked", {
        menu: menu.id, item: item.id,
        reason: item.reason ?? "(disabled without a reason — contract violation, report it)",
      });
      return;
    }
    probeShell("shell.menu.action", { menu: menu.id, item: item.id, label: item.label });
    close(true);
    item.onAction?.();
  };

  const menuIdx = (id: string | null): number => menus.findIndex((m) => m.id === id);

  const onBarKeyDown = (e: React.KeyboardEvent): void => {
    if (openMenu === null) return;
    const menu = menus[menuIdx(openMenu)];
    const items = menu.items;
    if (e.key === "Escape") {
      e.preventDefault();
      close(true); // focus returns to the menubar button (contract)
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusIdx((i) => (i + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusIdx((i) => (i - 1 + items.length) % items.length);
    } else if (e.key === "Home") {
      e.preventDefault();
      setFocusIdx(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setFocusIdx(items.length - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      const next = menus[(menuIdx(openMenu) + 1) % menus.length];
      open(next.id);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      const prev = menus[(menuIdx(openMenu) - 1 + menus.length) % menus.length];
      open(prev.id);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const item = items[focusIdx];
      if (item !== undefined) activate(menu, item);
    }
  };

  return (
    <div className="menubar" role="menubar" aria-label="application menu" ref={barRef} onKeyDown={onBarKeyDown}>
      {menus.map((menu) => (
        <div key={menu.id} className="menubar-entry">
          <button
            type="button"
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={openMenu === menu.id}
            className={`menubar-button ${openMenu === menu.id ? "menubar-button-open" : ""}`}
            ref={(el) => { if (el !== null) buttonRefs.current.set(menu.id, el); }}
            data-menu={menu.id}
            onClick={() => (openMenu === menu.id ? close(false) : open(menu.id))}
            onPointerEnter={() => { if (openMenu !== null && openMenu !== menu.id) open(menu.id); }}
            onKeyDown={(e) => {
              if (openMenu === null && (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ")) {
                e.preventDefault();
                open(menu.id);
              } else if (openMenu === null && e.key === "ArrowRight") {
                e.preventDefault();
                const next = menus[(menuIdx(menu.id) + 1) % menus.length];
                buttonRefs.current.get(next.id)?.focus();
              } else if (openMenu === null && e.key === "ArrowLeft") {
                e.preventDefault();
                const prev = menus[(menuIdx(menu.id) - 1 + menus.length) % menus.length];
                buttonRefs.current.get(prev.id)?.focus();
              }
            }}
          >
            {menu.label}
          </button>
          {openMenu === menu.id && (
            <div className="menu-popup" role="menu" aria-label={menu.label}>
              {menu.items.map((item, i) => (
                <React.Fragment key={item.id}>
                  {item.separatorBefore === true && <div className="menu-separator" role="separator" />}
                  <div
                    role="menuitem"
                    tabIndex={i === focusIdx ? 0 : -1}
                    aria-disabled={!item.enabled}
                    aria-checked={item.checked}
                    data-item={item.id}
                    title={item.enabled ? item.shortcut ?? "" : item.reason ?? ""}
                    className={`menu-item ${item.enabled ? "" : "menu-item-disabled"} ${i === focusIdx ? "menu-item-focused" : ""}`}
                    ref={(el) => { itemRefs.current[i] = el; }}
                    onPointerEnter={() => setFocusIdx(i)}
                    onClick={() => activate(menu, item)}
                  >
                    <span className="menu-item-check">{item.checked === true ? "✓" : ""}</span>
                    <span className="menu-item-label">{item.label}</span>
                    {item.shortcut !== undefined && <span className="menu-item-shortcut">{item.shortcut}</span>}
                  </div>
                </React.Fragment>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
