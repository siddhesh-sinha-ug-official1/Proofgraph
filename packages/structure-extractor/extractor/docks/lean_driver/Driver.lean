/-
Lean extraction/verdict driver — feasibility spike (remediation round).

Given a single .lean file, elaborate it with the REAL toolchain (kernel
trustLevel 0) and emit ONE JSON document on stdout describing every
top-level declaration: kernel acceptance, sorry usage, axiom reachability
(with an explicit allowlist), the resolved proof-dependency set (refs),
unused explicit hypotheses, imports, and errors — plus declared limits.

Run:  lean --run Driver.lean <target.lean>
(from this directory, so the adjacent lean-toolchain file pins the version)

Design choice (declared): kernel/environment-level APIs ONLY —
Parser.parseHeader / Elab.processHeader / Elab.IO.processCommands,
Environment.constants, ConstantInfo expression walks (getUsedConstants),
Lean.collectAxioms, declRangeExt via findDeclarationRanges?.  InfoTree is
deliberately NOT used (version-sensitive surface); the cost is declared in
limits[] (no per-binder source positions for unused hypotheses).
-/
import Lean

open Lean Elab

/-- Axiom allowlist (exact, declared in output): the three axioms of the
Lean 4 core trust base.  `funext` is a THEOREM in Lean 4 core (proved via
`Quot.sound`), not an axiom, so it is intentionally absent.  `sorryAx` is
NOT allowlisted: it surfaces both in usesSorry and unexpectedAxioms. -/
def axiomAllowlist : List Name := [``propext, ``Classical.choice, ``Quot.sound]

def declKindOf : ConstantInfo → String
  | .thmInfo _    => "theorem"
  | .defnInfo _   => "def"
  | .axiomInfo _  => "axiom"
  | _             => "other"

/-- Walk the type's forall telescope in lockstep with the value's lambda
telescope; report EXPLICIT binders whose bound variable does not occur in
the corresponding lambda body.  Pure Expr walk: at each level the binder
just introduced is loose bvar #0 of the body, so `hasLooseBVar 0` is exact
(no instantiation needed).  Stops at the first level where the value is no
longer a lambda (remaining binders are then unjudged — declared limit). -/
partial def unusedExplicitBinders (type value : Expr) (acc : Array Name := #[]) : Array Name :=
  match type, value with
  | .forallE tn _ tb bi, .lam _ _ vb _ =>
    let acc := if bi.isExplicit && !vb.hasLooseBVar 0 then acc.push tn else acc
    unusedExplicitBinders tb vb acc
  | _, _ => acc

def severityStr : MessageSeverity → String
  | .error => "error" | .warning => "warning" | .information => "information"

def posJson (p : Position) : Json :=
  Json.mkObj [("line", Json.num p.line), ("col", Json.num p.column)]

def namesJson (ns : Array Name) : Json :=
  Json.arr (ns.map (fun n => Json.str n.toString))

/-- 4.31 quirk (measured, not assumed): `ConstantInfo.value?` returns none
for `thmInfo` (async proof storage) — the proof Expr lives on the
`TheoremVal.value` field, which forces the async task when accessed. -/
def proofValue? : ConstantInfo → Option Expr
  | .thmInfo t  => some t.value
  | ci          => ci.value?

def directRefs (ci : ConstantInfo) : Array Name :=
  let vs := (proofValue? ci).map (·.getUsedConstants) |>.getD #[]
  (ci.type.getUsedConstants ++ vs).foldl (fun (a : Array Name) x =>
    if a.contains x then a else a.push x) #[]

/-- Skip compiler-internal auxiliaries; keep user-level decls only. -/
def isUserDecl (n : Name) : Bool :=
  !n.isInternal && !n.isAnonymous

/-- refs with LOCAL internal auxiliaries (e.g. `fixB._proof_1` minted by
tactics like omega) expanded transitively into their own dependency sets,
so the reported set names real constants, not compiler bookkeeping. -/
partial def expandedRefs (env : Environment) (root : Name) : Array Name :=
  let isLocalInternal (r : Name) : Bool :=
    !isUserDecl r && (env.getModuleIdxFor? r).isNone
  let rec go (work : List Name) (visited : NameSet) (acc : Array Name) : Array Name :=
    match work with
    | [] => acc
    | r :: rest =>
      if visited.contains r then go rest visited acc
      else
        let visited := visited.insert r
        if isLocalInternal r then
          match env.find? r with
          | some ci => go ((directRefs ci).toList ++ rest) visited acc
          | none => go rest visited acc
        else if acc.contains r then go rest visited acc
        else go rest visited (acc.push r)
  match env.find? root with
  | some ci => go (directRefs ci).toList {} #[]
  | none => #[]

/-- Per-decl record, computed inside CoreM (collectAxioms + declaration
ranges need the environment). -/
def declJson (env : Environment) (n : Name) : CoreM (Option (Position × Json)) := do
  let some ci := env.find? n | return none
  let axioms ← collectAxioms n
  let usesSorry := axioms.contains ``sorryAx
  let unexpected := axioms.filter (fun a => !axiomAllowlist.contains a)
  let refs := expandedRefs env n
  let unused :=
    match proofValue? ci with
    | some v => unusedExplicitBinders ci.type v
    | none => #[]
  let ranges? ← findDeclarationRanges? n
  let pos := match ranges? with
    | some r => r.range.pos
    | none => ⟨0, 0⟩
  let j := Json.mkObj [
    ("name", Json.str n.toString),
    ("kind", Json.str (declKindOf ci)),
    ("pos", posJson pos),
    -- present in the environment after elaboration at trustLevel 0 ⇒ the
    -- kernel accepted it (possibly via sorryAx — see usesSorry).
    ("kernelAccepted", Json.bool true),
    ("usesSorry", Json.bool usesSorry),
    ("axioms", namesJson axioms),
    ("unexpectedAxioms", namesJson unexpected),
    ("refs", namesJson refs),
    ("unusedHypotheses", Json.arr (unused.map (fun b =>
      Json.mkObj [("binderName", Json.str b.toString)])))
  ]
  return some (pos, j)

def limits : List String := [
  "single-file driver: lake project targets (multi-file import graphs) are next-round work",
  "kernelAccepted means: the declaration entered the Environment after elaboration at kernel trustLevel 0; a decl whose elaboration failed entirely is ABSENT from decls[] and visible only via errors[] (or present with usesSorry=true when recovery inserted sorryAx)",
  "unusedHypotheses covers explicit binders matched by the value's leading lambda telescope; if the elaborated value is not a lambda at some level (eta-contracted / non-lambda proof term), remaining binders are unjudged; binder source positions omitted (would require InfoTree)",
  "InfoTree deliberately unused (version-sensitive API surface) — kernel/environment-level APIs only; per-binder/per-ref positions are the declared cost",
  "axiom nesting gap (Lean issue #8840): an axiom referenced only inside another axiom's TYPE is not followed by collectAxioms",
  "axiom allowlist (exact): propext, Classical.choice, Quot.sound; funext excluded because it is a theorem in Lean 4 core; sorryAx never allowlisted",
  "refs = getUsedConstants over type+value AFTER elaboration: resolved constant names, deduplicated, order of first occurrence; includes core-library constants (consumer filters to the ingested set); LOCAL underscore-internal auxiliaries (e.g. omega's <decl>._proof_N) are expanded transitively into their real dependencies, but user-visible auxiliaries (<decl>.match_N etc.) are reported as-is",
  "toolchain quirk (4.31, measured): ConstantInfo.value? returns none for theorems (async proof storage) — the driver reads TheoremVal.value directly, which forces the async elaboration task",
  "imports = elaborated header imports of the target file (module names as written), deduplicated; the implicit Init prelude appears even for files with no import line"
]

unsafe def main (args : List String) : IO UInt32 := do
  let some (fileName : String) := args[0]? |
    IO.eprintln "usage: lean --run Driver.lean <target.lean>"; return 2
  let input ← IO.FS.readFile ⟨fileName⟩
  initSearchPath (← findSysroot)
  enableInitializersExecution  -- processHeader → importModules (loadExts := true) requires it
  let inputCtx := Parser.mkInputContext input fileName
  let (header, parserState, messages) ← Parser.parseHeader inputCtx
  let (env, headerMsgs) ← processHeader header {} messages inputCtx
  let env := env.setMainModule `DriverTarget
  let commandState := Command.mkState env headerMsgs {}
  let s ← IO.processCommands inputCtx parserState commandState
  let env := s.commandState.env
  let cmdMsgs := s.commandState.messages
  -- 4.31 quirk (measured): header-import failures land ONLY in processHeader's
  -- returned log; processCommands' final state does not carry them forward.
  -- Union both logs (dedupe by pos+severity+text) so import errors are never lost.
  let mut msgList : Array (Position × String × String) := #[]
  for m in headerMsgs.toList ++ cmdMsgs.toList do
    let text ← m.data.toString
    let key := (m.pos, severityStr m.severity, text)
    if !msgList.contains key then
      msgList := msgList.push key
  let hasErrors := headerMsgs.hasErrors || cmdMsgs.hasErrors

  -- errors[] — every message with a position, severity, rendered text
  let mut errJs : Array Json := #[]
  for (pos, sev, text) in msgList do
    errJs := errJs.push (Json.mkObj [
      ("pos", posJson pos),
      ("severity", Json.str sev),
      ("message", Json.str text)])

  -- local (this-file) constants live in the second stage of the ConstMap
  let localNames := env.constants.map₂.foldl (fun (a : Array Name) n _ =>
    if isUserDecl n then a.push n else a) #[]

  -- per-decl records via CoreM
  let coreCtx : Core.Context := {
    fileName := fileName, fileMap := inputCtx.fileMap, options := {} }
  let coreSt : Core.State := { env := env }
  let (declRecs, _) ← (localNames.filterMapM (declJson env ·)).toIO coreCtx coreSt
  let declRecs := declRecs.qsort (fun (a, _) (b, _) =>
    a.line < b.line || (a.line == b.line && a.column < b.column))

  let importNames := env.header.imports.foldl (fun (a : Array Name) i =>
    if a.contains i.module then a else a.push i.module) #[]
  let importJs := importNames.map (fun m => Json.str m.toString)

  let out := Json.mkObj [
    ("toolchain", Json.mkObj [
      ("leanVersion", Json.str Lean.versionString),
      ("how", Json.str "lean --run Driver.lean <target>, elan shim (~/.elan/bin/lean or %USERPROFILE%\\.elan\\bin\\lean.exe), version pinned by the adjacent lean-toolchain file; kernel trustLevel 0")]),
    ("decls", Json.arr (declRecs.map (·.2))),
    ("imports", Json.arr importJs),
    ("errors", Json.arr errJs),
    ("limits", Json.arr (limits.toArray.map Json.str))
  ]
  IO.println out.compress
  return (if hasErrors then 1 else 0)
