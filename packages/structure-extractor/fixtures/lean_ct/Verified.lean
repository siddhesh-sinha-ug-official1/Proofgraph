-- CT-path fixture (remediation round, LEAN-DOCK): single file, Init-only,
-- exercising the four verdict cases the dock must judge honestly:
--   base_fact      — kernel-accepted, clean            -> green
--   uses_base      — clean AND refs base_fact          -> green + RESOLVED proof_uses edge
--   unused_hyp_case — clean, h used, h2 NOT used       -> green + unusedHypotheses [h2]
--   sorry_case     — proof by sorry                    -> amber (NEVER green)

theorem base_fact : 1 + 1 = 2 := rfl

theorem uses_base : 2 = 1 + 1 := base_fact.symm

theorem unused_hyp_case (h : True) (h2 : 1 + 1 = 2) : True := h

theorem sorry_case : 2 + 2 = 5 := sorry
