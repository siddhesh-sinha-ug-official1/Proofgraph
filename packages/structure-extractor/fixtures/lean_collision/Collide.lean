/- REAL-INPUTS round regression fixture — raw-name collision, distilled from
   the measured bug on toolchain source Init/Classical.lean (v4.31.0):
   a decl written INSIDE a namespace and a top-level decl written with a
   dotted name share the same LAST name component ('mark' here, 'choose'
   there).  The pre-round matcher keyed both sides by that raw last
   component alone: the last writer silently won, verdict attestations
   named the WRONG decl and proof_uses edges crossed nodes.  This file
   pins the disambiguated matching (exact / dotted-suffix on the written
   identifier). -/

namespace Collide

theorem mark : 1 + 1 = 2 := rfl

theorem uses_mark : 1 + 1 = 2 := mark

end Collide

theorem Extra.mark : 3 + 3 = 6 := rfl
