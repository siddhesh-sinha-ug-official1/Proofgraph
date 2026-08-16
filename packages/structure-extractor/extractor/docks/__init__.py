from .base import CandidateEdge, Dock, DockResult, HonestCeiling, ResolverDecision
from .python_dock import PythonDock
from .lean_dock import LeanDock
from .latex_dock import LatexDock
from .typst_dock import TypstDock

ALL_DOCKS = {d.lang: d for d in (PythonDock, LeanDock, LatexDock, TypstDock)}
