import Util
import lib

/-- Probe-repo entry module -- the representative file the battery opens.
The do-block body carries the two scan targets: the cross-file callee
`printAnswer` from Util.lean, and the dependency callee `lib.parse`.
No `let`, no `#eval`: the clean file publishes zero diagnostics, and P2
appends the profile injection -- a genuine Lean type error. -/
def run : IO Unit := do
  printAnswer (helper (lib.parse ("src")))
