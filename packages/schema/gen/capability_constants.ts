// GENERATED from capability.json by schemagen.py. Do not edit by hand.
// Depth tiers (CT|S|G|P — how deep the TOOLING sees) are ORTHOGONAL to
// provenance tiers (T1|T2|T3 — what KIND of graph element).  Assembly ruling:
// S-tier may NOT emit resolved edges (the seam owner's table wins).
export const CAPABILITY_VERSION = "v0" as const;

export const DEPTH_TIERS = ["CT", "S", "G", "P"] as const;
export type DepthTier = (typeof DEPTH_TIERS)[number];

export const DEPTH_ALLOWS_RESOLVED_EDGES: Record<DepthTier, boolean> = { CT: true, S: false, G: false, P: false };
export const DEPTH_TO_MAX_PROVENANCE: Record<DepthTier, string> = { CT: "T2", S: "T2", G: "T1", P: "T1" };

export const HONEST_CEILINGS: Record<DepthTier, string> = {
  CT: "as deep as the compiler's type-checker sees (compiler-truth; green permitted from real verdicts only)",
  S: "structure only: real navigation, no type truth; green forbidden; edges are leads unless a gradual checker binds them",
  G: "grammar floor: T1 structure only ('this span IS a def/loop'); every edge resolved=false; fill at best unknown; green forbidden",
  P: "plaintext + links: text and a cross-reference graph; everything unresolved; green forbidden",
};
