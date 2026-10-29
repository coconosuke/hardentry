// 小さなテストの道具
const tests = [];
export function test(name, fn) { tests.push({ name, fn }); }
export class AssertError extends Error {}
export function ok(v, msg = '') { if (!v) throw new AssertError('ok失敗: ' + msg); }
export function eq(a, b, msg = '') {
  const sa = JSON.stringify(a), sb = JSON.stringify(b);
  if (sa !== sb) throw new AssertError(`eq失敗: ${msg}\n  実際: ${sa}\n  期待: ${sb}`);
}
export function near(a, b, eps, msg = '') { if (!(Math.abs(a - b) <= eps)) throw new AssertError(`near失敗: ${msg} ${a} vs ${b} (±${eps})`); }
export async function runTests(filter) {
  const res = [];
  for (const t of tests) {
    if (filter && !t.name.includes(filter)) continue;
    const t0 = performance.now();
    try { await t.fn(); res.push({ name: t.name, ok: true, ms: performance.now() - t0 }); }
    catch (e) { res.push({ name: t.name, ok: false, ms: performance.now() - t0, err: String(e && e.stack || e) }); }
  }
  tests.length = 0;
  return res;
}
