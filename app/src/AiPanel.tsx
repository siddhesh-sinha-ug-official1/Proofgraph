/**
 * P3 — the AI panel: POST {question} to the ai server (:8478) and render the
 * answer TOGETHER WITH the tool calls it made — the panel always shows WHICH
 * graph facts the answer used (the outlet's outlet.tool.exec pins, served by
 * ai/server.ts as `toolCalls`). No key material ever reaches this code: the
 * browser sends a question and receives an answer — the ai server's response
 * gate + the outlet scrub + the build-time bundle scan are the three proofs.
 */

import React, { useState } from "react";

export interface AiToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  output: string;
  isError: boolean;
  truncated: boolean;
}

export interface AiAskResponse {
  ok: boolean;
  transport: string;
  provider: string;
  model: string;
  answer: string;
  stopReason: string;
  toolRounds: number;
  toolCalls: AiToolCall[];
  bounds: Record<string, number>;
  graphFacts: {
    schemaVersion: string | null;
    nodes: number; edges: number; leads: number;
    roots: string[];
    unusedProvided: number | null;
    provenanceSource: string | null;
  };
}

function prettyToolOutput(output: string): string {
  try {
    return JSON.stringify(JSON.parse(output), null, 2);
  } catch {
    return output;
  }
}

export default function AiPanel({ aiBase }: { aiBase: string }): React.ReactElement {
  const [question, setQuestion] = useState("Which declarations in this graph are unused?");
  const [busy, setBusy] = useState(false);
  const [resp, setResp] = useState<AiAskResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function ask(): Promise<void> {
    setBusy(true);
    setError(null);
    setResp(null);
    try {
      let r: Response;
      try {
        r = await fetch(`${aiBase}/ask`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question }),
        });
      } catch (e) {
        throw new Error(`ai-server-unreachable: ${e instanceof Error ? e.message : String(e)} — start it: node ai/server.ts (port 8478)`);
      }
      const body = await r.json();
      if (!r.ok) {
        throw new Error(`${body.failureClass ?? "ai-bad-response"}: ${body.detail ?? `HTTP ${r.status}`}`);
      }
      setResp(body as AiAskResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ai-panel">
      <div className="panel-title">AI outlet <span className="hint">(keys live ONLY in the ai-server process)</span></div>
      <div className="ai-ask-row">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !busy) void ask(); }}
          placeholder="ask about the composed graph…"
        />
        <button onClick={() => void ask()} disabled={busy}>{busy ? "asking…" : "ask"}</button>
      </div>
      {error !== null && <div className="banner banner-error">{error}</div>}
      {resp !== null && (
        <div className="ai-result">
          <div className="ai-badges">
            <span className={`badge badge-${resp.transport}`}>transport: {resp.transport.toUpperCase()}</span>
            <span className="badge">model: {resp.model}</span>
            <span className="badge">stop: {resp.stopReason}</span>
            <span className="badge">tool rounds: {resp.toolRounds}/{resp.bounds.maxToolRounds}</span>
          </div>
          <div className="ai-answer">{resp.answer}</div>
          <div className="panel-subtitle">graph facts the answer used (outlet.tool.exec pins)</div>
          {resp.toolCalls.length === 0 && <div className="hint">no tools were called — the answer used NO graph facts</div>}
          {resp.toolCalls.map((tc) => (
            <div key={tc.id} className={`tool-call ${tc.isError ? "tool-call-error" : ""}`}>
              <div className="tool-call-head">
                <b>{tc.name}</b>({JSON.stringify(tc.args)}) · call id {tc.id}
                {tc.isError && <span className="badge badge-error">isError</span>}
                {tc.truncated && <span className="badge badge-warn">truncated (bound logged)</span>}
              </div>
              <pre className="tool-call-output">{prettyToolOutput(tc.output)}</pre>
            </div>
          ))}
          <div className="hint">
            snapshot: {resp.graphFacts.nodes} nodes · {resp.graphFacts.edges} edges · {resp.graphFacts.leads} leads
            {" · "}roots {JSON.stringify(resp.graphFacts.roots)}
            {" · "}unused provided: {resp.graphFacts.unusedProvided ?? "none (no claim)"}
            {" · "}{resp.graphFacts.provenanceSource ?? ""}
          </div>
        </div>
      )}
    </div>
  );
}
