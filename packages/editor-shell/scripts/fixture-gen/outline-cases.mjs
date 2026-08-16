/**
 * outline-fixture.json cases (§9.5 worst-case-wins table) — SUB200
 * restructure: split from ../gen-fixture-nodes.mjs, content byte-identical.
 */

export const outlineFixture = [
  { caseName: "red-wins", worstOf: ["green", "amber", "red"], expectedChosen: "red", expectedStatus: "red" },
  { caseName: "amber-over-blue", worstOf: ["blue", "amber", "green"], expectedChosen: "amber", expectedStatus: "amber" },
  { caseName: "blue-over-definition", worstOf: ["definition", "blue", "lemma"], expectedChosen: "blue", expectedStatus: "blue" },
  { caseName: "definition-over-lemma", worstOf: ["lemma", "definition"], expectedChosen: "definition", expectedStatus: "blue" },
  { caseName: "lemma-over-green", worstOf: ["green", "lemma"], expectedChosen: "lemma", expectedStatus: "green" },
  { caseName: "all-green", worstOf: ["green", "green"], expectedChosen: "green", expectedStatus: "green" },
  { caseName: "empty-worstOf", worstOf: [], expectedChosen: "none", expectedStatus: "green" },
  { caseName: "null-outline", worstOf: null, expectedChosen: "(null)", expectedStatus: "not-yet-computed" },
];
