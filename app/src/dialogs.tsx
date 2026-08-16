/**
 * App-shell round — the shell's modal dialogs (contract list):
 *  - Open folder… / Open file…  : SERVER-SIDE browse over hub /fs/list (the
 *    browser never touches the filesystem);
 *  - Choose declared roots…     : multi-select over /fs/roots-candidates —
 *    roots stay DECLARED, NEVER inferred; current declared roots shown;
 *  - Preferences                : theme / editor font size / graph cap /
 *    auto-reanalyze-on-save — every change probed + persisted (versioned key).
 *    UI-1C note: Ctrl+, now opens the PAGED SettingsDialog.tsx instead;
 *    PreferencesDialog stays exported (unmounted) so a rollback still composes;
 *  - About                      : schema PIN + wall versions + MEASURED tier
 *    (verbatim from pins) + licenses (incl. the logged elkjs EPL-2.0 note) +
 *    the contract's out-of-scope list VERBATIM.
 *
 * All dialogs: role="dialog", aria-modal, Esc closes, initial focus inside;
 * every hub failure inside a dialog renders its NAMED class — never blank.
 *
 * SUB200 restructure: this module is now the FACADE over dialogModal.tsx
 * (the modal base), dialogBrowse.tsx (server-side browse + root picker) and
 * dialogInfo.tsx (preferences / about / gap report). Public surface unchanged.
 */

export { Modal } from "./dialogModal";
export { OpenPathDialog, RootPickerDialog } from "./dialogBrowse";
export {
  AboutDialog, GapReportDialog, OUT_OF_SCOPE_VERBATIM, PreferencesDialog,
} from "./dialogInfo";
