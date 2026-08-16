-- Fixture (a): clean file — all kernelAccepted, B.refs contains A, no sorry.

theorem fixA : 1 + 1 = 2 := rfl

theorem fixB : 2 + 2 = 4 := by
  have h := fixA
  omega

def fixC : Nat := 42
