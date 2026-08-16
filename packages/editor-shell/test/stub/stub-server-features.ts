/**
 * StubLanguageServer feature-request handlers (SUB200 restructure: split from
 * the stub-server.ts handle() switch, logic verbatim). Returns true when the
 * method was one of the feature requests this module owns.
 */

import type { JsonRpcMessage } from "../../src/seams/capability.js";
import type { SymbolMeta } from "./stub-server-config.js";
import { collectNames } from "./stub-server-text.js";
import type { StubLanguageServer } from "./stub-server.js";

export function handleFeatureRequest(server: StubLanguageServer, msg: JsonRpcMessage): boolean {
  switch (msg.method) {
    case "textDocument/hover": {
      const word = server.wordAtParams(msg.params);
      if (!word) {
        server.respond(msg.id, null);
        return true;
      }
      server.respond(msg.id, {
        contents: { kind: "markdown", value: `stub hover for \`${word.text}\`` },
        range: word.range,
      });
      return true;
    }
    case "textDocument/definition": {
      const word = server.wordAtParams(msg.params);
      const def = word ? server.cfg.meta.definitions[word.text] : undefined;
      if (!word || !def || !server.doc) {
        server.respond(msg.id, []);
        return true;
      }
      server.respond(msg.id, [
        {
          uri: server.doc.uri,
          range: server.byteSpanToRange(def.byteStart, def.byteEnd),
        },
      ]);
      return true;
    }
    case "textDocument/documentSymbol": {
      const toSym = (s: SymbolMeta): unknown => ({
        name: s.name,
        kind: s.kind,
        range: server.byteSpanToRange(s.byteStart, s.byteEnd),
        selectionRange: server.byteSpanToRange(s.byteStart, s.byteStart),
        children: (s.children ?? []).map(toSym),
      });
      server.respond(msg.id, server.cfg.meta.symbols.map(toSym));
      return true;
    }
    case "textDocument/completion": {
      const items = collectNames(server.cfg.meta.symbols).map((n) => ({ label: n, kind: 3 }));
      server.respond(msg.id, { isIncomplete: false, items });
      return true;
    }
    case "textDocument/foldingRange": {
      const ranges = server.cfg.meta.symbols.map((s) => {
        const r = server.byteSpanToRange(s.byteStart, s.byteEnd);
        return { startLine: r.start.line, endLine: r.end.line, kind: "region" };
      });
      server.respond(msg.id, ranges);
      return true;
    }
    case "textDocument/semanticTokens/full":
      server.respond(msg.id, { data: [] });
      return true;
    default:
      return false;
  }
}
