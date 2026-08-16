-- Acceptance honest-ceiling case: Lean is a G-tier dock this round
-- (T1 structure nodes + candidate leads only; zero resolved edges; unknown, never green).

theorem base_fact : 1 + 1 = 2 := rfl

theorem uses_base (h : True) : 1 + 1 = 2 := base_fact

theorem lonely (h : True) (h2 : 2 + 2 = 4) : True := h
