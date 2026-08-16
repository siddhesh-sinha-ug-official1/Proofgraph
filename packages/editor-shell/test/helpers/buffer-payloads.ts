/**
 * S1 buffer-test shared fixture name + probe payload shapes (SUB200
 * restructure: split from 01-buffer.test.ts, verbatim).
 */

export const FIX = "whitespace.py";

export interface RoundtripPayload {
  equalBytes: boolean;
  firstDivergenceOffset: number | null;
  whitespaceDelta: number;
  sourceSha: string;
  modelSha: string;
}

export interface ClassifyPayload {
  versionId: number;
  classification: "user" | "programmatic" | "silent";
  cause: string;
}
