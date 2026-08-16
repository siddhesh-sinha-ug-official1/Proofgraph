# ai/server — the P3 ai face server modules

Modules behind the `ai/server.ts` facade: constants and shapes, the fake
Anthropic transport (nothing reaches the network), the per-ask hub snapshot
fetcher, the `/ask` route, the server core — every response body is
re-scanned for the process's own key material before writing — and the CLI
entry guard. Exercised by the ai suite (14 tests) and by
`app/test/p3.build.gate.test.ts` (`audit/AUDIT-ai.json`).

## Files (verified)

Verified purposes from `audit/AUDIT-ai.json`. Line counts measured on disk 2026-08-03 (post doc-fix state).

| file | lines | verified purpose |
|---|---|---|
| `config.ts` | 36 | Constants (AI_SERVER_VERSION, DEFAULT_PORT 8478, DEFAULT_HUB_BASE :8477, DEFAULT_MODEL) and the AiTransport/AiServerConfig/AiServerHandle shapes shared by the server modules; correctly notes the secret literals live in ai/server.ts for the build gate. |
| `fakemodel.ts` | 115 | fakeAnthropicRoutes(): one FakeRoute matching POST api.anthropic.com/v1/messages that first requests exactly one tool (listLeads for lead/unresolved-flavored questions, else listUnused) and then composes its answer text solely from the tool_result bytes present in the request, tagged [FAKE-transport ...]; consumed by server/core.ts through cell 6's makeFakeFetch, so nothing reaches the network. |
| `hub.ts` | 74 | fetchHubSnapshot(): GETs {hubBase}/graph (transport failure -> HubDown; non-200 -> OutletHttpRefusal 503 carrying the hub's failureClass verbatim) then /query?kind=unused (200 -> roots/unused provenance; non-200 -> no-claim provenance naming the refusal class), returning the per-ask graph+provenance pair; called by askroute.ts on every /ask. |
| `askroute.ts` | 100 | handleAsk(): buffers the POST /ask body, refuses bad JSON or a missing question (400 ai-bad-request), fetches a fresh hub snapshot, constructs the outlet and runs ask(), then sends answer + toolCalls (rebuilt from the outlet's own outlet.tool.exec pins) + bounds + usage + graphFacts through deps.send (core.ts's guard-2 chokepoint), mapping OutletHttpRefusal/HubDown/OutletFailure/other to their typed status+failureClass. |
| `core.ts` | 135 | createAiServer(): resolves config (fake vs live key sourcing — live without a key is a typed ai-live-key-missing refusal; masterSecret default chain cfg -> env -> facade literal), builds one byok wall per server (fake transport wired to fakeAnthropicRoutes), and serves /health and POST /ask over node:http where every response body is re-scanned for the process's own key material before writing (a hit becomes a 500 key-leak refusal); returns {server, port, transport, close}. |
| `cli.ts` | 60 | maybeRunCli(): starts the server only when the facade's module url equals pathToFileURL(argv[1]), parsing --live/--port/--hub, defaulting FAKE mode to a per-process randomized masterSecret (env AI_MASTER_SECRET wins; live mode falls through to the facade literal), printing a one-line ready/failure JSON; called once from the bottom of ai/server.ts. |
