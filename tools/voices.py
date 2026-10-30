# 声を作る: src/audio/lines.js の台詞 → 話す人ごとに1つの m4a ＋ 目次（src/assets/voices/）。
#   1) node で台詞の表を build_tmp/lines.json に書き出す（tools/voices.sh がやる）
#   2) python3 -I tools/voices.py [Whisperのフォルダ]
# 声のもとは ffmpeg に入っている flite（rms・slt・awb・kal16）。rubberband で高さ・速さを変えて人ごとの声にし、
# 叫ぶ台詞は速く・高く・圧縮して張りを出す。最後に Whisper で聞き取れるか確かめ、まとめて書き出す。
import json, os, subprocess, sys, wave
import numpy as np

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
TMP = os.path.join(ROOT, 'build_tmp', 'voices'); OUT = os.path.join(ROOT, 'src', 'assets', 'voices')
os.makedirs(TMP, exist_ok=True); os.makedirs(OUT, exist_ok=True)
SR = 24000
data = json.load(open(os.path.join(ROOT, 'build_tmp', 'lines.json'), encoding='utf8'))
LINES = data['LINES']

# 話す人: もとの声、高さ（半音）、速さ、声の太さ（formant）
SPK = {
    'p':   dict(voice='rms', pitch=0.0, tempo=1.06, who='swat'),
    'o0':  dict(voice='rms', pitch=-2.5, tempo=1.0, who='swat'),
    'o1':  dict(voice='rms', pitch=2.0, tempo=1.03, who='swat'),
    'o2':  dict(voice='slt', pitch=-1.0, tempo=1.04, who='swat'),
    'o3':  dict(voice='awb', pitch=-1.5, tempo=1.0, who='swat'),
    'toc': dict(voice='slt', pitch=-2.5, tempo=0.98, who='toc'),
    's0':  dict(voice='rms', pitch=-4.5, tempo=1.05, who='sus', rough=True),
    's1':  dict(voice='awb', pitch=-3.0, tempo=1.08, who='sus', rough=True),
    's2':  dict(voice='awb', pitch=-5.0, tempo=1.0, who='sus', rough=True),
    'c0':  dict(voice='slt', pitch=1.5, tempo=1.08, who='civ'),
    'c1':  dict(voice='rms', pitch=2.0, tempo=1.1, who='civ'),
    'c2':  dict(voice='slt', pitch=-2.0, tempo=1.0, who='civ'),
}
# 自分（p）が言うのは呼びかけと投げ物・リロードだけ
P_LINES = {'swat_police', 'swat_hands', 'swat_drop', 'swat_ground', 'swat_civ', 'swat_flash', 'swat_stinger', 'swat_gas', 'swat_reload', 'swat_breaching'}
CALM = {'swat_copy', 'swat_locked', 'swat_cuffsus', 'swat_cuffciv', 'swat_mirror_sus', 'swat_mirror_civ', 'swat_mirror_clear', 'sus_fake', 'toc_start', 'toc_copy', 'toc_soft', 'toc_bomb', 'toc_fail'}

def ff(*args):
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', *args], check=True)

def load(p):
    w = wave.open(p); x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768; return x

def save(p, x, sr=SR):
    x = np.clip(np.nan_to_num(x), -1, 1)
    w = wave.open(p, 'wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes((x * 32767).astype(np.int16).tobytes()); w.close()

def trim(x, thr=0.02):
    e = np.convolve(np.abs(x), np.ones(240) / 240, 'same'); m = e.max() or 1
    idx = np.where(e > thr * m)[0]
    if not len(idx): return x
    return x[max(0, idx[0] - 240): min(len(x), idx[-1] + 1200)]

def synth(text, spk, line, path, S=None):
    S = S or SPK[spk]
    tf = path + '.txt'; open(tf, 'w').write(text)
    raw = path + '.raw.wav'
    ff('-f', 'lavfi', '-i', f"flite=textfile='{tf}':voice={S['voice']}", '-ar', str(SR), '-ac', '1', raw)
    shout = line not in CALM and S['who'] != 'toc'
    pitch = S['pitch'] + (1.2 if shout else 0)
    tempo = S['tempo'] * (1.04 if shout else 1.0)
    chain = [f"rubberband=pitch={2 ** (pitch / 12):.5f}:tempo={tempo:.4f}:formant=preserved",
             'highpass=f=110', 'lowpass=f=7600']
    if shout: chain += ['equalizer=f=2600:t=q:w=1.2:g=5', 'equalizer=f=900:t=q:w=1:g=2', 'acompressor=threshold=0.08:ratio=6:attack=3:release=60:makeup=3']
    else: chain += ['equalizer=f=2200:t=q:w=1.2:g=2', 'acompressor=threshold=0.15:ratio=3:attack=5:release=80:makeup=1.5']
    if S.get('rough'): chain += ['asoftclip=type=tanh:threshold=0.6']
    out = path + '.fx.wav'
    ff('-i', raw, '-af', ','.join(chain), '-ar', str(SR), '-ac', '1', out)
    x = trim(load(out))
    x = x / (np.abs(x).max() or 1) * 0.89
    # 端をなめらかに
    a = min(len(x) // 4, 96); b = min(len(x) // 4, 960)
    if a: x[:a] *= np.linspace(0, 1, a)
    if b: x[-b:] *= np.linspace(1, 0, b)
    save(path, x)
    for f in (tf, raw, out):
        try: os.remove(f)
        except OSError: pass
    return x

def words(s):
    import re
    s = s.lower().replace('-', ' ').replace('c.s.', 'cs').replace("door's", 'door is').replace("it's", 'it is').replace("we've", 'we have').replace("i've", 'i have').replace("i'm", 'i am').replace("don't", 'do not').replace("didn't", 'did not').replace("can't", 'cannot').replace("they're", 'they are').replace('flash bang', 'flashbang')
    return [w for w in re.sub(r"[^a-z0-9 ]", ' ', s).split() if w]

def score(ref, hyp):
    r, h = words(ref), words(hyp)
    if not r: return 1.0
    # 単語の一致率（編集距離）
    d = np.zeros((len(r) + 1, len(h) + 1), int); d[:, 0] = range(len(r) + 1); d[0, :] = range(len(h) + 1)
    for i in range(1, len(r) + 1):
        for j in range(1, len(h) + 1):
            d[i, j] = min(d[i - 1, j] + 1, d[i, j - 1] + 1, d[i - 1, j - 1] + (0 if r[i - 1] == h[j - 1] else 1))
    return max(0.0, 1 - d[len(r), len(h)] / len(r))

def main():
    asr_dir = sys.argv[1] if len(sys.argv) > 1 else None
    W = None
    if asr_dir:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        from asr import Whisper, load_wav
        W = Whisper(asr_dir)
    index = {'v': 1, 'sr': SR, 'spk': {}, 'clips': {}}
    report = []
    gap = np.zeros(int(SR * 0.15), np.float32)
    for spk, S in SPK.items():
        parts, t, clips = [gap], len(gap) / SR, {}
        for line, L in LINES.items():
            if L['who'] != S['who']: continue
            if spk == 'p' and line not in P_LINES: continue
            for i, text in enumerate(L['v']):
                path = os.path.join(TMP, f'{spk}_{line}_{i}.wav')
                x = synth(text, spk, line, path)
                acc = None
                if W:
                    hyp = W(load_wav(path)); acc = score(text, hyp)
                    # 聞き取りにくいときは、高さの変え方を弱めたり、もとの声を替えたりして、いちばん聞き取れるものを使う
                    if acc < 0.75:
                        best = (acc, x, hyp)
                        base = SPK[spk]
                        alts = [dict(base, pitch=base['pitch'] * 0.4), dict(base, voice='rms' if base['voice'] != 'rms' else 'awb', pitch=base['pitch'] * 0.4), dict(base, voice='slt' if spk in ('o2', 'toc', 'c0', 'c2') else 'rms', pitch=0.0, tempo=1.0)]
                        for k, alt in enumerate(alts):
                            p2 = path + f'.alt{k}.wav'
                            x2 = synth(text, spk, line, p2, alt)
                            h2 = W(load_wav(p2)); a2 = score(text, h2)
                            if a2 > best[0]: best = (a2, x2, h2); os.replace(p2, path)
                            else: os.remove(p2)
                            if a2 >= 0.75: break
                        acc, x, hyp = best
                    report.append((spk, line, i, text, hyp, acc))
                clips[f'{line}.{i}'] = [round(t, 4), round(len(x) / SR, 4)]
                parts += [x, gap]; t += (len(x) + len(gap)) / SR
        y = np.concatenate(parts)
        wpath = os.path.join(TMP, f'pack_{spk}.wav'); save(wpath, y)
        ff('-i', wpath, '-ar', str(SR), '-ac', '1', '-c:a', 'aac', '-b:a', '32k', os.path.join(OUT, f'{spk}.m4a'))
        index['spk'][spk] = {'dur': round(len(y) / SR, 3), 'n': len(clips)}
        index['clips'][spk] = clips
        print(spk, len(clips), 'clips', round(len(y) / SR, 1), 's', flush=True)
    json.dump(index, open(os.path.join(OUT, 'index.json'), 'w'), ensure_ascii=False)
    if report:
        with open(os.path.join(ROOT, 'build_tmp', 'voices_asr.tsv'), 'w', encoding='utf8') as f:
            for r in report: f.write('\t'.join(str(v) for v in r) + '\n')
        accs = [r[5] for r in report]
        bad = [r for r in report if r[5] < 0.6]
        print('ASR: clips', len(accs), 'mean', round(float(np.mean(accs)), 3), 'below0.6', len(bad))
        for r in bad[:40]: print('  LOW', r[0], r[1], r[2], repr(r[3]), '→', repr(r[4]), round(r[5], 2))
    size = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT) if f.endswith('.m4a'))
    print('bytes', size)

if __name__ == '__main__':
    main()
