# PROVENANCE — real_lean (REAL-INPUTS round, worklist item 3b)

**What**: three theorem-bearing `.lean` files vendored BYTE-VERBATIM from
the Lean 4 toolchain's own shipped library source, as previously-unseen
REAL inputs for outerwall `analyze()` regression coverage
(`outerwall/test_real_inputs.py`).  Layout: the analyzed source root is
`real_lean/src/` (this note and the license text sit OUTSIDE it so the
frozen analyses see only the three real files).

- **Origin**: this machine's elan-installed toolchain —
  `A:\lean\elan\toolchains\leanprover--lean4---v4.31.0\src\lean\Init\`
  (upstream https://github.com/leanprover/lean4, shipped inside the
  official toolchain distribution).
- **Version**: toolchain `leanprover/lean4:v4.31.0` — DELIBERATELY the
  driver's own pin (REPORT-LEAN-DRIVER-SPIKE.md): the files' `Init.*`
  imports resolve against the SAME toolchain's `.olean` tree the driver
  elaborates with, so single-file elaboration is exact, no external deps.
- **License**: **Apache-2.0** (permissive) — Lean FRO, LLC / Microsoft
  Corporation per the in-file headers (retained untouched).  Full text
  vendored alongside as `LICENSE.lean4.txt` (the toolchain's own LICENSE).
- **Files** (each honors the DECLARED single-file driver bound — real
  content, individually elaboratable; multi-file lake stays a declared
  limit, NOT exercised here):
  - `src/ByCases.lean` (55 lines) — `Init/ByCases.lean`: by_cases tactic
    support; 7 named theorems incl. the intra-file kernel dependency
    `apply_ite → apply_dite`.
  - `src/Classical.lean` (213 lines) — `Init/Classical.lean`: classical
    logic; 42 named decls, a dense real proof_uses DAG, every proof
    reaching the allowlisted `Classical.choice` axiom, AND the raw-name
    collision (`choose`/`choose_spec` in `namespace Classical` vs
    top-level `Exists.choose`/`Exists.choose_spec`) that surfaced the
    REAL-INPUTS matcher bug — the frozen collision regression carrier.
  - `src/SizeOfLemmas.lean` (42 lines) [HONESTY-SWEEP correction: was
    "46 lines"; measured 42 on disk (newline count; sha256 pin unchanged
    and matches the toolchain original byte-verbatim)] —
    `Init/SizeOfLemmas.lean`: 9
    simp-proved sizeOf lemmas (BitVec/UInt/Char/Subtype).
- **Why these**: genuine ecosystem Lean (not authored for this repo, not
  derived from any demo fixture), theorem-bearing, kernel-clean, compact
  enough for the ~3 s/file warm driver budget.

**Pinned bytes** (sha256 — asserted by `test_real_inputs.py`; a drifted
fixture is a build failure):

| file | sha256 |
|---|---|
| `src/ByCases.lean` | `3270f4bafaf99ca67f69b57972d0c3ef73e0ba46d359c8cd4645be254ac97965` |
| `src/Classical.lean` | `23abb81f0a18f68badec8b2f7d3f65e3017882c3cd6dabea244d1abcdb1a3b77` |
| `src/SizeOfLemmas.lean` | `58b3fd3d6a8e895305eba5479667cdf2ddd54a3bfcc867809b125e8485a71d85` |

**Analysis config of record** (the frozen regression):
`analyze(fixtures/real_lean/src, config={'extractor': {'pyright_mode':
'none'}})` — kernel driver at CT through the REAL V1 capability feed
(cell 2 measures lean live); roots stay UNDECLARED (reachability refuses
honestly — the declared-roots story is carried by real_py/colorama).
