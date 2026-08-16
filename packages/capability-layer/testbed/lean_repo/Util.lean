/-- Cross-file callee module: `printAnswer` and `helper` are the battery's
P4/P5/P7/P9 targets, referenced from main.lean. -/

def helper (a : Nat) : Nat := a + 1

def printAnswer (n : Nat) : IO Unit := IO.println n
