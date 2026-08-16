"""Tree 3 — ProofGraph Structure & Relationship Extractor cell.

Maximally probe-able; the Phase-1 membrane (wall.py, MEMBRANE-SPEC.md) is
promoted OVER these pins and never replaces them.  Public entry points:

    from extractor.pipeline import ExtractorCell, PipelineConfig
    cell = ExtractorCell(PipelineConfig(...))
    result = cell.run(source_root)
    cell.probeCatalog(); cell.dump(); cell.tap(id, fn); cell.history()
"""
