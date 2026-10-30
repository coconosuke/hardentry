// 素材の読み込み: 公開版はページに埋め込んだbase64、開発中はファイルを読む
const cache = {};

function b64ToBuf(s) {
  const bin = atob(s);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u.buffer;
}

export async function getAsset(name) {
  if (cache[name]) return cache[name].slice(0);
  const A = globalThis.__ASSETS;
  let buf;
  if (A && A[name]) { buf = b64ToBuf(A[name]); delete A[name]; }
  else {
    const base = globalThis.__ASSET_BASE || 'src/assets/';
    const res = await fetch(base + name);
    if (!res.ok) throw new Error('素材が読めません: ' + name);
    buf = await res.arrayBuffer();
  }
  cache[name] = buf;
  return buf.slice(0);
}

export async function getAssetURL(name, type) {
  const buf = await getAsset(name);
  return URL.createObjectURL(new Blob([buf], { type }));
}
