# REPORT — UI-1C POLISH: the cell-5 DOM skin (graph node cards + edges)

Round file: `30lean-push/agentic-convos/ui-1c-round.md` §Polish round (DONE).
Spec of record: `proofgraph/shell-design/ProofGraphGraphFirst.dc.html` (node-card
markup studied lines 174–186 + `proofdata.js` mkN paints) + README §Design tokens.

## The gap this round closed

The 1c shell's CHROME was already faithful (verified live in the prior round),
but the GRAPH NODE CARDS — most of the screen in a graph-first layout — still
rendered cell 5's internal styling: system-ui font, radius-8 8px-padding cards,
default React Flow edges/background, #000 selection outline, visible connection
handles. Closed with an APP-SIDE CSS skin (`app/src/styles.css` §"cell-5 DOM
skin") over the DOM the cell renders. Cells untouched (`packages/graph-view`
read-only; its own suite spot-run green, 133/133).

## The bound (logged explicitly)

- The skin keys on cell 5's rendered DOM classes (`.react-flow__*`,
  `.proof-node`, `.prov`, `.sig`, `.react-flow__handle`). A future cell-5
  markup change SHEDS the skin — cards fall back to the cell's own inline
  styling: ugly, never wrong (the inline verdict paints are self-contained).
- Alternative recorded, NOT taken: a labelled cell-5 change request moving the
  design tokens into the cell itself.
- VERDICT COLORS STAY CANONICAL: fill (inline `background`), ring (inline
  `box-shadow`) and lead strokes (inline on the LeadEdge path) are the cell's
  paints — the skin sets zero paint on them and carries zero color hexes
  (tokens only). The one recolor: the cell's `#000` selection outline (an
  affordance, not a verdict) → the free accent, per the design.

## Enforcement — `app/test/shell1c.skin.test.tsx` (3 tests, in-suite)

1. grep app/src for the five verdict hexes (2E7D32/F9A825/C62828/1565C0/9E9E9E)
   returns ZERO files;
2. GraphView mounted over a REAL wall in jsdom: per-node computed fill + ring
   byte-identical with the skin stylesheet enabled vs disabled; sheet liveness
   proven via a skin-only property (jsdom does not model !important-over-inline
   — pixel geometry was verified in the live browser instead); every mounted
   node's inline fill matches `COLORS[data-fill-status]` (hatch for unknown);
3. static: no `!important` on any paint-bearing property
   (background/box-shadow/fill/stroke) anywhere in the stylesheet.

## Per-element diff table (computed styles, prototype vs app, DARK)

Prototype served statically (ephemeral port 8611, started AND stopped, port
verified freed); app on the live vite 5199 dev server. App probes via
computed-style JS (+ read_page) — no app screenshots (Monaco-canvas machine
quirk). App values were read at 80% pane zoom, which scales stylesheet px by
0.8 uniformly (e.g. borders 1px→0.8px); table shows the unscaled CSS value.

| Element | Prototype | App | Verdict |
| --- | --- | --- | --- |
| Node card radius | 9px | 9px | match |
| Node card padding | 5px 10px | 5px 10px | match |
| Node card font | "Segoe UI", system-ui | "Segoe UI", system-ui | match |
| Node card fill | verdict color (e.g. rgb(46,125,50)) | cell inline paint, identical hexes | match (canonical, both) |
| Verdict ring | border 2–2.5px solid verdict color | cell's 3px box-shadow halo, verdict color | explained: ring COLOR canonical from the cell; the cell draws it as a halo, not a border — changing the drawing needs a cell change (option not taken) |
| Node drop shadow | 0 1px 3px rgba(20,22,28,.25) | none | explained: skin mandate is flat — no shadows added; box-shadow is the cell's ring channel |
| Card height | fixed 46px, 2 lines | cell-computed, 3 lines | explained: the app card carries the contract-required provenance line ("provenance never anonymous") |
| Title line | 600 12px UI, nowrap-ellipsis | 600 12px UI, nowrap-ellipsis | match |
| Id/meta lines | 9.5px JetBrains Mono, opacity .8 | 9.5px JetBrains Mono, opacity .8 (`.prov` + `.sig`) | match |
| Node cursor | pointer | pointer (specificity-bumped past RF's `.draggable` grab) | match |
| Connection handles | none drawn | opacity 0, pointer-events none (geometry kept for edge routing) | match |
| Selection ring | box-shadow 0 0 0 3px accent | outline 3px solid accent, offset 3px past the verdict ring | match (accent, 3px; outline because box-shadow is the cell's ring channel) |
| Selected connected edges | accent 2.4px overlay path | not drawn | explained: edge-selection paint lives inside cell 5; would need a labelled cell change — not taken |
| Resolved edge | var(--edge) 1.5px (rgb(92,96,102) dark) | var(--edge) 1.5px, identical rgb | match |
| Arrowheads | none | none (cell defines no markers) | match |
| Lead edge | #9E9E9E dashed 1.6px | cell inline #9E9E9E dash (untouched) + skin width 1.6px | match (color cell-owned; none served in the live workspace — verified by rule + cell suite) |
| Canvas dots | radial-gradient var(--gdot) 1px / 24px, static (non-panning) | identical (app `.graph-dots`; RF `<Background/>` hidden to avoid double grid) | match |
| Minimap/controls | absent | absent (never rendered); RF attribution kept, recolored onto tokens (xyflow attribution ask) | match + explained |
| Inspector card | 320px, radius 11, 10px 12px, island bg/border | identical | match |
| Legend chip | 24px h, radius 9, 10.5px, island | identical | match |
| Stats pill | radius 9, 5px 11px, 11px UI | identical | match |
| Zoom cluster | radius 9, 2px 5px, island | identical | match |
| Window title bar | 32px, 0 6px 0 12px, 1px bottom border | identical | match |
| Status bar | 26px, 11.5px, 1px top border | identical | match |
| Gear popup · banner · welcome | — | — | chrome verified live in the prior round (REPORT-UI-1C); untouched this round |

## Light mode (flipped through the REAL Settings path, then restored)

| Token | Prototype light | App light | Verdict |
| --- | --- | --- | --- |
| Edge stroke | rgb(183,187,194) (#B7BBC2) | identical | match |
| Canvas dots | rgba(0,0,0,.07) / 24px | identical | match |
| Island bg/border | #FFFFFF / #D8DAE0 | identical | match |
| Dim text | #6C707E | identical | match |
| Node card fill/ring | verdict colors, theme-independent | identical (cell paints untouched by theme) | match |

Prefs left at the dark default; zero console errors on the live app after all
probes; node double-click reveal + auto-hide affordances untouched (no
pointer-event interception added — handles excepted, which never had them).

## Final sweep (exact counts)

- app `npx vitest run`: **111 passed + 1 todo** (baseline 108+1, +3 skin;
  build + bundle-secret gate in-suite, green)
- app `npx tsc --noEmit`: clean
- `packages/graph-view` own `npm test` (spot-run insurance, cell untouched):
  **133/133**
