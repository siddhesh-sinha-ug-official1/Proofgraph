/**
 * vessels/v2_runner_protocol.mjs — line-oriented JSON protocol to the
 * spawned hub runner (vessels/v2_hub_runner.py).
 *
 * SUB200 restructure: split out of vessels/test_v2_squiggle.mjs (which stays
 * the `node --test` entry point).  Behavior unchanged.
 */

/** line-oriented JSON protocol to the runner */
export class Runner {
  constructor(proc) {
    this.proc = proc;
    this.lines = [];
    this.waiters = [];
    this.exited = new Promise((res) => proc.on("exit", (c) => res(c)));
    this.stderr = "";
    proc.stderr.on("data", (d) => { this.stderr += d.toString(); });
    let buf = "";
    proc.stdout.on("data", (d) => {
      buf += d.toString();
      let i;
      while ((i = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line.startsWith("{")) continue; // non-protocol noise
        const obj = JSON.parse(line);
        const w = this.waiters.shift();
        if (w) w(obj); else this.lines.push(obj);
      }
    });
  }
  next(timeoutMs, what) {
    if (this.lines.length) return Promise.resolve(this.lines.shift());
    return new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error(
        `runner timeout (${what}); stderr tail: ${this.stderr.slice(-2000)}`)),
        timeoutMs);
      this.waiters.push((o) => { clearTimeout(t); res(o); });
    });
  }
  async cmd(line, timeoutMs = 30000) {
    this.proc.stdin.write(line + "\n");
    const res = await this.next(timeoutMs, line);
    if (res.error) throw new Error(`runner ${line} → ${res.error}`);
    return res;
  }
}
