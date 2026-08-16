// ============================================================================
// probeCatalog() source of truth — every lead in §6 of the dossier, expanded
// per provider, plus this build's density additions (marked [addition]).
// The ProbeBus refuses to emit any probeId not listed here, so the catalog is
// complete by construction. NO node/edge kinds appear — this cell mints no
// graph elements (§4); that absence is intentional and honest.
//
// AGGREGATOR: the sections live under ./catalog/ (vault / adapters /
// cost-arena / scan-wall) and are concatenated here in the catalog's original
// order — the assembled catalog is element-for-element identical to the
// single-file version it replaced (168 entries; counts test-asserted).
// ============================================================================

import type { CatalogEntry } from "./bus.ts";
import { vaultEntries } from "./catalog/vault.ts";
import { adapterEntries } from "./catalog/adapters.ts";
import { costEntries, arenaEntries } from "./catalog/cost-arena.ts";
import { leakScanEntries, wallEntries } from "./catalog/scan-wall.ts";

export function buildCatalog(): CatalogEntry[] {
  return [
    // ---- 6.A Key Vault -----------------------------------------------------
    ...vaultEntries(),
    // ---- per-provider adapter leads (§6.B–G) + provider-specific leads -----
    ...adapterEntries(),
    // ---- 6.H cost meter ----------------------------------------------------
    ...costEntries(),
    // ---- 6.I arena (the round-trip gate) -----------------------------------
    ...arenaEntries(),
    // ---- 6.J secret-leak scan ----------------------------------------------
    ...leakScanEntries(),
    // ---- Phase-1 wall (assembly) -------------------------------------------
    ...wallEntries(),
  ];
}
