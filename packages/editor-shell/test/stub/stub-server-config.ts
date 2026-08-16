/**
 * StubLanguageServer configuration surface (SUB200 restructure: split from
 * stub-server.ts, verbatim): fixture metadata shapes, capability advertising
 * switches, misbehavior switches, and the default config.
 */

/** The single open document the stub server tracks. */
export interface DocState {
  uri: string;
  text: string;
  version: number;
}

export interface DiagnosticRule {
  pattern: string;
  severity: 1 | 2 | 3 | 4;
  message: string;
  source?: string;
  code?: string | number;
  tags?: number[];
  /** Pattern of a related location within the same document. */
  relatedPattern?: string;
  relatedMessage?: string;
  quickfix?: boolean;
}

export interface SymbolMeta {
  name: string;
  kind: number; // LSP SymbolKind
  byteStart: number; // absolute file byte offsets (incl. BOM bytes)
  byteEnd: number;
  children?: SymbolMeta[];
}

export interface StubServerFixtureMeta {
  bomBytes: number;
  diagnosticRules: DiagnosticRule[];
  symbols: SymbolMeta[];
  /** token name → definition byte span (absolute). */
  definitions: Record<string, { byteStart: number; byteEnd: number }>;
}

export interface StubServerConfig {
  name: string;
  version: string;
  positionEncodingMode: "accept-utf8" | "force-utf16" | "omit";
  meta: StubServerFixtureMeta;
  advertise: {
    hover: boolean;
    definition: boolean;
    documentSymbol: boolean;
    completion: boolean;
    foldingRange: boolean;
    semanticTokens: boolean;
    callHierarchy: boolean;
    typeHierarchy: boolean;
  };
  behaviors: {
    /** Publish one stale-version batch after the next didChange (§9.6). */
    staleOnNextChange: boolean;
    /** Send a response with an id we never received, once, after initialize. */
    orphanResponseAfterInit: boolean;
    /** Emit $/progress begin/end + window/logMessage around didOpen. */
    progressOnOpen: boolean;
    /** Ask the client for workspace/configuration after initialized. */
    requestConfiguration: boolean;
    /** Reject the first N initialize requests (handshake-fail path). */
    failInitializeTimes: number;
  };
}

export const DEFAULT_STUB_SERVER_CONFIG: StubServerConfig = {
  name: "stub-pyright",
  version: "1.1.0-stub",
  positionEncodingMode: "accept-utf8",
  meta: { bomBytes: 0, diagnosticRules: [], symbols: [], definitions: {} },
  advertise: {
    hover: true,
    definition: true,
    documentSymbol: true,
    completion: true,
    foldingRange: true,
    semanticTokens: false,
    callHierarchy: false, // OPTIONAL LSP capability — deliberately absent
    typeHierarchy: false, // OPTIONAL LSP capability — deliberately absent
  },
  behaviors: {
    staleOnNextChange: false,
    orphanResponseAfterInit: false,
    progressOnOpen: false,
    requestConfiguration: false,
    failInitializeTimes: 0,
  },
};
