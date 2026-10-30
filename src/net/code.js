// 部屋のコード（5文字）と招待リンク
// 見まちがえやすい字（0/O、1/I/L、2/Z、5/S、8/B など）は使わない
export const CODE_CHARS = 'ACDEFGHJKMNPQRTUVWXY34679';
export const CODE_LEN = 5;

export function makeCode(rnd = Math.random) {
  let s = '';
  for (let i = 0; i < CODE_LEN; i++) s += CODE_CHARS[Math.floor(rnd() * CODE_CHARS.length) % CODE_CHARS.length];
  return s;
}

// 小文字・空白・区切りは許す。使わない字が入っていたら null（別の部屋に入らないように）
export function normCode(v) {
  if (typeof v !== 'string') return null;
  const s = v.toUpperCase().replace(/[\s\-_]/g, '');
  if (s.length !== CODE_LEN) return null;
  for (const ch of s) if (!CODE_CHARS.includes(ch)) return null;
  return s;
}

// 招待リンク: ページのURL + #join=ABCDE（#join-ABCDE も受け付ける）
export function joinLink(code, href = (typeof location !== 'undefined' ? location.href : '')) {
  const base = String(href).split('#')[0];
  return base + '#join=' + code;
}
export function codeFromHash(hash = (typeof location !== 'undefined' ? location.hash : '')) {
  const m = /#join[-=]([A-Za-z0-9]{5})\b/.exec(hash || '');
  return m ? normCode(m[1]) : null;
}

// この端末（このタブ）の目印。読み込み直しても同じ（戻ってこられるように）
export function makeCid(rnd = Math.random) {
  let s = '';
  for (let i = 0; i < 10; i++) s += 'abcdefghijkmnpqrstuvwxyz23456789'[Math.floor(rnd() * 32) % 32];
  return s;
}
