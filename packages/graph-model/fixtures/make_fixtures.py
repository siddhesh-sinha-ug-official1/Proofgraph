"""Regenerate every fixture byte-exactly (LF endings, no editor mangling).

Run from graph-model/:  python fixtures/make_fixtures.py
Verifies the golden sha256 of sample.py (Appendix B) after writing.
"""
import hashlib
import json
from pathlib import Path

FIXTURES = Path(__file__).resolve().parent
GOLDEN_SAMPLE_SHA = "43c921b9a6b016cb03dc7b0a0e5898938a436a643a749bf41e0cf39d194d9548"


def w(name, content):
    (FIXTURES / name).write_bytes(content.encode("utf-8"))


def wj(name, obj):
    w(name, json.dumps(obj, indent=2) + "\n")


def main():
    # --- golden fixture: A calls B; C unreferenced (spans per Appendix B.3:
    # A[0,24) trivia[24,26)="\n\n" B[26,48) trivia[48,50)="\n\n" C[50,72)) ---
    sample = ("def A():\n    return B()\n" + "\n\n"
              + "def B():\n    return 1\n" + "\n\n"
              + "def C():\n    return 2\n")
    w("sample.py", sample)
    got = hashlib.sha256(sample.encode()).hexdigest()
    assert len(sample.encode()) == 72, f"sample.py is {len(sample.encode())} bytes, want 72"
    assert got == GOLDEN_SAMPLE_SHA, f"sample.py sha {got} != golden"
    wj("sample.manifest.json", {
        "module": {"name": "sample", "file": "fixtures/sample.py", "lang": "python"},
        "decls": [
            {"ordinal": 1, "kind": "function", "name": "A", "byteStart": 0, "byteEnd": 24},
            {"ordinal": 2, "kind": "function", "name": "B", "byteStart": 26, "byteEnd": 48},
            {"ordinal": 3, "kind": "function", "name": "C", "byteStart": 50, "byteEnd": 72},
        ],
        "trivia": [
            {"byteStart": 24, "byteEnd": 26},
            {"byteStart": 48, "byteEnd": 50},
        ],
        "refs": [
            {"fromDecl": "sample.A", "refName": "B", "kind": "calls", "atByte": 20},
        ],
    })
    wj("roots.json", {"roots": ["sample.A"], "source": "fixture-manifest"})

    # --- resolved=false lead path (Appendix B.8): Z is not a declared node ---
    unresolved = "def D():\n    return Z()\n"
    w("unresolved_ref.py", unresolved)
    assert len(unresolved.encode()) == 24
    wj("unresolved_ref.manifest.json", {
        "module": {"name": "unresolved_ref", "file": "fixtures/unresolved_ref.py",
                   "lang": "python"},
        "decls": [
            {"ordinal": 1, "kind": "function", "name": "D", "byteStart": 0, "byteEnd": 24},
        ],
        "trivia": [],
        "refs": [
            {"fromDecl": "unresolved_ref.D", "refName": "Z", "kind": "calls", "atByte": 20},
        ],
    })
    wj("unresolved_ref.roots.json", {"roots": ["unresolved_ref.D"],
                                     "source": "fixture-manifest"})

    # --- edge.rejected path: a ref whose src decl does not exist ---
    rejected = "def E():\n    return 3\n"
    w("rejected_ref.py", rejected)
    wj("rejected_ref.manifest.json", {
        "module": {"name": "rejected_ref", "file": "fixtures/rejected_ref.py",
                   "lang": "python"},
        "decls": [
            {"ordinal": 1, "kind": "function", "name": "E", "byteStart": 0,
             "byteEnd": len(rejected.encode())},
        ],
        "trivia": [],
        "refs": [
            {"fromDecl": "rejected_ref.GHOST", "refName": "E", "kind": "calls", "atByte": 0},
        ],
    })
    wj("rejected_ref.roots.json", {"roots": ["rejected_ref.E"],
                                   "source": "fixture-manifest"})

    # --- reformatting-invariance fixture: SAME logical file (the manifest says
    # fixtures/sample.py), reflowed bytes; every Node.id must be unchanged
    # while Node.span moves ---
    a2 = "def A():\n\n    return B()\n"            # 25 bytes
    t1 = "\n\n\n"                                  # 3
    b2 = "def B():\n    return 1\n"                # 22
    t2 = "\n"                                      # 1
    c2 = "def C():\n            return 2\n"        # 30
    reflowed = a2 + t1 + b2 + t2 + c2
    w("sample_reflowed.py", reflowed)
    n = len(reflowed.encode())
    assert n == 81, f"reflowed is {n} bytes, want 81"
    wj("sample_reflowed.manifest.json", {
        "note": "reflowed presentation of the SAME logical file fixtures/sample.py "
                "(reformatting-invariance fixture: ids must not move, spans must)",
        "module": {"name": "sample", "file": "fixtures/sample.py", "lang": "python"},
        "decls": [
            {"ordinal": 1, "kind": "function", "name": "A", "byteStart": 0, "byteEnd": 25},
            {"ordinal": 2, "kind": "function", "name": "B", "byteStart": 28, "byteEnd": 50},
            {"ordinal": 3, "kind": "function", "name": "C", "byteStart": 51, "byteEnd": 81},
        ],
        "trivia": [
            {"byteStart": 25, "byteEnd": 28},
            {"byteStart": 50, "byteEnd": 51},
        ],
        "refs": [
            {"fromDecl": "sample.A", "refName": "B", "kind": "calls", "atByte": 21},
        ],
    })

    print("fixtures written and byte-verified")


if __name__ == "__main__":
    main()
