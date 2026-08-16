"""Stage H — library inventory, assembled in priority order (§7.9):

  1. on-demand via the wired handle (completion after `import lib` then `lib.`),
  2. static contracts (`ybc doc --format=json` — the stub/typeshed equivalent),
  3. registry catalog ("what libraries exist").

This tier is inherently NON-UNIFORM — there is no "list all libraries and APIs"
primitive. That cap is emitted as a lead (Operating Contract rule 8: no silent
caps), never hidden.
"""

from __future__ import annotations

import json
import os
import subprocess

from . import spine

STAGE = "lib"


def run(bus, profile: dict, disc: dict, client, config: dict) -> dict:
    sources_used = []
    inventory = {"ondemand": None, "static": None, "registry": None}

    # 1 — on-demand via the wired handle (pull-only, precise, resolved by ybc)
    if client is not None and (client.capabilities or {}).get("completionProvider"):
        # [ASSEMBLY CHANGE V1] scratch doc takes the profile's extension
        # (identical for .ybg languages); CompletionList unwrapped like P6.
        uri = spine.path_to_uri(os.path.join(
            config["work_dir"], "_inventory" + profile["fileExt"]))
        text = "import lib\nlib."
        client.did_open(uri, text)
        # the shim publishes diagnostics for this doc; leave them for pred-filtered waits
        resp = client.request("textDocument/completion",
                              {"textDocument": {"uri": uri},
                               "position": {"line": 1, "character": 4}})
        items = resp.get("result") or []
        if isinstance(items, dict):
            items = items.get("items") or []
        bus.emit("capability.lib.ondemand", "call",
                 {"request": {"doc": text, "position": {"line": 1, "character": 4}},
                  "response": items}, stage=STAGE)
        inventory["ondemand"] = items
        sources_used.append("ondemand-completion")

    # 2 — static contracts: ybc doc --format=json
    if profile.get("compilerCLI") and any(m.startswith("doc")
                                          for m in disc["compilerModes"]):
        argv = list(config["ybc_argv"]) + ["doc", "--format=json"]
        cp = subprocess.run(argv, capture_output=True, text=True,
                            encoding="utf-8", timeout=30)
        bus.emit("capability.lib.static", "call",
                 {"argv": argv, "stdout": cp.stdout, "exitCode": cp.returncode},
                 stage=STAGE)
        if cp.returncode == 0:
            inventory["static"] = json.loads(cp.stdout)
            sources_used.append("doc-json")

    # 3 — registry catalog
    packages = disc.get("registryPackages") or []
    if packages:
        bus.emit("capability.lib.registry", "call",
                 {"source": "ybg.dev/pkg (fixture-answered; seam for the live "
                            "registry)", "packages": packages}, stage=STAGE)
        inventory["registry"] = packages
        sources_used.append("registry")

    # the honest cap — logged, not silent
    bus.emit("capability.lib.nonuniform", "value",
             {"note": "no 'list all libraries/APIs' primitive exists; inventory "
                      "assembled from %d source(s)" % len(sources_used),
              "sources": sources_used}, stage=STAGE)
    inventory["sources"] = sources_used
    return inventory
