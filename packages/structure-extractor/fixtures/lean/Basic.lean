import Mathlib.Data.Nat.Basic

def double (n : Nat) : Nat := n + n

theorem double_eq (n : Nat) : double n = n + n := by
  rfl

section Helpers

lemma triv : True := trivial

end Helpers

structure Point where
  x : Nat
  y : Nat
