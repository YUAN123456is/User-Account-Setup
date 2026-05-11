/**
 * Detects whether a Radix UI outside-interaction event originated from
 * inside a portaled overlay (Select dropdown, Combobox, DropdownMenu, etc.)
 * that is rendered outside the current component's DOM subtree.
 *
 * Use this in onPointerDownOutside / onInteractOutside handlers of
 * Dialog, Popover, Sheet, etc. to prevent them from closing when the user
 * interacts with a nested portaled element.
 */
export function isInsideRadixPortal(e: Event): boolean {
  // Radix wraps the native event inside a CustomEvent with detail.originalEvent
  const original = (e as CustomEvent).detail?.originalEvent as
    | PointerEvent
    | FocusEvent
    | MouseEvent
    | undefined;
  const target = (original?.target ?? (e as PointerEvent).target) as Element | null;

  if (target) {
    // Direct ancestry checks — fast path when the target is still in the DOM
    if (target.closest("[data-radix-popper-content-wrapper]")) return true;
    if (target.closest("[data-radix-select-viewport]")) return true;
    if (target.closest("[data-radix-menu-content]")) return true;
    if (target.closest("[data-radix-dropdown-menu-content]")) return true;
    // Role-based fallbacks for items rendered inside popper viewports
    if (target.closest("[role='option']")) return true;
    if (target.closest("[role='listbox']")) return true;
    if (target.closest("[role='menu']")) return true;
    if (target.closest("[role='menuitem']")) return true;
  }

  // Timing fallback: the popper may already have started its close animation
  // and still be present in the DOM. If ANY popper content wrapper exists,
  // we know the click was inside one.
  return !!document.querySelector("[data-radix-popper-content-wrapper]");
}
