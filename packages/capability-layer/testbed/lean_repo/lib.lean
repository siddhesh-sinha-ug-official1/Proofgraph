/-- Tiny in-repo library: the P6 / inventory completion target and the home
of the `lib.parse` dependency callee. Declared with dotted names so the
battery's ybg-shaped `lib.` scratch document addresses a real namespace. -/

def lib.parse (source : String) : Nat := source.length

def lib.render (count : Nat) : String := String.ofList (List.replicate count 'x')
