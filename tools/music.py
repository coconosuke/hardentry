# BGMを作る（外部の音素材は使わない）: python3 -I tools/music.py
#  menu … 署（タイトル・メニュー）: ノワールのベースと、もやの中のブレイクビーツ（88BPM・16小節）
#  op   … 作戦中: 低い持続音と工業的な質感、遠い金属音、心音のような脈（64秒）
#  pvp  … 対戦: 刻む低いシンセと緊張の弦（96BPM・16小節）
# Ready Or Not の音楽の評（ノワールの環境音楽・インダストリアル・ブレイクビーツ・明滅するシンセ、緊張と解放）を手がかりに、自前で合成。
# 前後に0.25秒の「のりしろ」を付けて書き出す（AACの頭の無音でループが切れないように）。
import json, os, subprocess
import numpy as np
from scipy import signal
from scipy.io import wavfile

SR = 32000
PAD = 0.25
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = os.path.join(ROOT, 'src', 'assets', 'music')
TMP = os.path.join(ROOT, 'build_tmp', 'music')
os.makedirs(OUT, exist_ok=True); os.makedirs(TMP, exist_ok=True)
rng = np.random.default_rng(2026)

def t_axis(L): return np.arange(int(round(L * SR))) / SR
def lp(x, fc, order=2): b, a = signal.butter(order, min(fc, SR * 0.45) / (SR / 2), 'low'); return signal.lfilter(b, a, x)
def hp(x, fc, order=2): b, a = signal.butter(order, fc / (SR / 2), 'high'); return signal.lfilter(b, a, x)
def bp(x, f0, f1, order=2): b, a = signal.butter(order, [f0 / (SR / 2), min(f1, SR * 0.45) / (SR / 2)], 'band'); return signal.lfilter(b, a, x)
def qf(f, L): return max(1, round(f * L)) / L
def circf(x, f):
    n = x.shape[-1]; y = f(np.concatenate([x, x, x], axis=-1)); return y[..., n:2 * n]
def saw(freq, t, phase=0.0):
    out = np.zeros_like(t); f = np.broadcast_to(np.atleast_1d(freq), t.shape)
    n = min(40, max(1, int((SR * 0.45) / float(np.max(f)))))
    ph = 2 * np.pi * np.cumsum(f) / SR + phase
    for k in range(1, n + 1): out += np.sin(k * ph) / k * (-1) ** (k + 1)
    return out * (2 / np.pi)
def env_ar(n, a, d, curve=3.0):
    i = np.arange(n) / SR
    return np.where(i < a, i / max(a, 1e-4), np.exp(-(i - a) / max(d, 1e-4) * curve))
def add_circ(dst, src, at):
    n = len(dst); i0 = int(round(at * SR)) % n; k = 0
    while k < len(src):
        m = min(len(src) - k, n - i0); dst[i0:i0 + m] += src[k:k + m]; k += m; i0 = 0
def ir(sec, damp=4.0, seed=0):
    r = np.random.default_rng(seed); n = int(sec * SR); t = np.arange(n) / SR; out = []
    for ch in range(2):
        x = r.standard_normal(n) * np.exp(-t / sec * damp); x = lp(x, 5200 - 800 * ch)
        for k in range(6):
            d = int(r.uniform(0.008, 0.06) * SR)
            if d < n: x[d] += r.uniform(0.2, 0.5) * (1 if r.random() < 0.5 else -1)
        x[:int(0.004 * SR)] = 0; out.append(x / np.sqrt(np.sum(x ** 2)))
    return out
def reverb_circ(x, sec, wet, seed=0):
    L = len(x); h = ir(sec, seed=seed); outs = []
    for c in range(2):
        hh = h[c][:L] if len(h[c]) > L else np.pad(h[c], (0, L - len(h[c])))
        outs.append(np.real(np.fft.ifft(np.fft.fft(x) * np.fft.fft(hh))))
    return np.stack(outs) * wet
def pan(x, p): a = (p + 1) * np.pi / 4; return np.stack([x * np.cos(a), x * np.sin(a)])
def soft(x, drive=1.0): return np.tanh(x * drive) / np.tanh(drive)
def midi(m): return 440 * 2 ** ((m - 69) / 12)

def write(name, st, L, br='56k'):
    n = st.shape[1]; p = int(PAD * SR)
    full = np.concatenate([st[:, n - p:], st, st[:, :p]], axis=1)
    peak = float(np.max(np.abs(full)))
    wav = os.path.join(TMP, name + '.wav')
    wavfile.write(wav, SR, (np.clip(full, -1, 1).T * 32767).astype(np.int16))
    m4a = os.path.join(OUT, name + '.m4a')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', wav, '-c:a', 'aac', '-b:a', br, '-ar', str(SR), m4a], check=True)
    rms = float(np.sqrt(np.mean(st ** 2)))
    # 検査: 無音・異常値・ループのつなぎ目の跳び
    seam = float(np.max(np.abs(st[:, 0] - st[:, -1])))
    silent = float(np.mean(np.abs(st).max(0) < 1e-4))
    print(f'{name}: {L:.2f}s peak {peak:.2f} rms {20*np.log10(rms+1e-9):.1f}dBFS seam {seam:.3f} silent {silent:.3f} nan {int(np.isnan(st).sum())} size {os.path.getsize(m4a)//1024}KB')
    return {'pad': PAD, 'len': round(n / SR, 6)}

# ---- 打楽器
def kick(dec=0.28, tone=48):
    m = int(0.5 * SR); tt = np.arange(m) / SR
    f = tone + 110 * np.exp(-tt / 0.028)
    k = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt / dec)
    k += bp(rng.standard_normal(m), 1200, 5000) * np.exp(-tt / 0.005) * 0.35
    return soft(k * 1.6, 1.8)
def snare(dec=0.16, bright=1.0):
    m = int(0.6 * SR); tt = np.arange(m) / SR
    body = np.sin(2 * np.pi * 190 * tt) * np.exp(-tt / 0.05) * 0.6
    nz = bp(rng.standard_normal(m), 1400, 7000 * bright) * np.exp(-tt / dec)
    return soft((body + nz) * 1.2, 1.4)
def hat(dec=0.02, g=1.0):
    m = int(0.12 * SR); tt = np.arange(m) / SR
    return hp(rng.standard_normal(m), 7000) * np.exp(-tt / dec) * g
def metal_hit(f0, dur=4.0):
    m = int(dur * SR); tt = np.arange(m) / SR; hit = np.zeros(m)
    for k, (r_, dk) in enumerate([(1, 2.2), (1.47, 1.7), (2.09, 1.3), (2.56, 1.0), (3.71, 0.7), (4.95, 0.5)]):
        fr = f0 * r_ * (1 - 0.008 * tt)
        hit += np.sin(2 * np.pi * np.cumsum(fr) / SR + rng.uniform(0, 6)) * np.exp(-tt / dk) / (k + 1)
    return lp(hit, 2200) * env_ar(m, 0.003, dur * 0.6, 1.0)

# ---------------------------------------------------------------- 署（メニュー）
def make_menu():
    bpm = 88; beat = 60 / bpm; bar = beat * 4; L = bar * 16
    t = t_axis(L); n = len(t); st = np.zeros((2, n)); mono = np.zeros(n)
    # 1 ブレイクビーツ（ブーンバップ寄り、少しはねる）。最初の4小節は控えめ
    for b in range(16):
        g = 0.55 if b < 4 else 1.0
        for q in ([0, 2.5] if b % 2 == 0 else [0, 1.75, 2.5]):
            add_circ(mono, kick() * 0.42 * g, b * bar + q * beat)
        for q in (1, 3):
            sn = snare(); ph = pan(sn * 0.2 * g, 0.05); add_circ(st[0], ph[0], b * bar + q * beat); add_circ(st[1], ph[1], b * bar + q * beat)
        if b % 4 == 3:
            gs = snare(0.06) * 0.06; add_circ(mono, gs, b * bar + 3.75 * beat)
        for e in range(8):
            sw = 0.08 * beat if e % 2 else 0
            ph = pan(hat(0.018 if e % 2 else 0.03, 0.055 if e % 2 == 0 else 0.03) * g, 0.35)
            add_circ(st[0], ph[0], b * bar + e * beat / 2 + sw); add_circ(st[1], ph[1], b * bar + e * beat / 2 + sw)
    # 2 ノワールのベース（Dマイナー）: D F A G | F E C A
    line = [(0, 38, 2), (2, 41, 1.5), (3.5, 45, 0.5), (4, 43, 2), (6, 41, 1), (7, 40, 1), (8, 36, 2), (10, 38, 1), (11, 33, 1), (12, 38, 2), (14, 41, 1.5), (15.5, 40, 0.5)]
    bass = np.zeros(n)
    for rep in range(4):
        for (s, mm, d) in line:
            at = (rep * 16 + s) * beat; m = int(d * beat * SR); tt = np.arange(m) / SR
            f = midi(mm)
            v = (np.sin(2 * np.pi * f * tt) + 0.35 * saw(f, tt)) * env_ar(m, 0.012, d * beat * 0.9, 1.4)
            add_circ(bass, lp(v, 520), at)
    mono += soft(bass * 0.9, 1.3) * 0.32
    # 3 パッド（Dm9 → B♭maj7 → Gm9 → A7♭9 を4小節ずつ）。テープのゆれ
    chords = [[50, 53, 57, 60, 64], [46, 50, 53, 57, 62], [43, 46, 50, 53, 57], [45, 49, 52, 55, 58]]
    pad = np.zeros(n)
    for ci, ch in enumerate(chords):
        at = ci * bar * 4; m = int(bar * 4 * SR) + int(0.5 * SR); tt = np.arange(m) / SR
        wow = 1 + 0.0025 * np.sin(2 * np.pi * 0.6 * tt)
        v = np.zeros(m)
        for mm in ch:
            f = midi(mm)
            for det in (-5, 5): v += saw(f * 2 ** (det / 1200) * wow, tt, rng.uniform(0, 6))
        e = np.minimum(1, tt / 1.2) * np.minimum(1, np.maximum(0, (bar * 4 + 0.5 - tt) / 0.8))
        add_circ(pad, lp(v, 900) * e, at)
    mono += pad * 0.014
    # 4 電子ピアノの和音（たまに、明滅する）
    for ci, ch in enumerate(chords):
        for k, off in enumerate([0.5, 2.5, 6.5, 10.5, 14.5]):
            if (ci + k) % 2: continue
            at = (ci * 16 + off) * beat; m = int(1.6 * SR); tt = np.arange(m) / SR
            v = np.zeros(m)
            for mm in ch[1:4]:
                f = midi(mm + 12); v += (np.sin(2 * np.pi * f * tt) + 0.25 * np.sin(2 * np.pi * f * 3 * tt) * np.exp(-tt / 0.15)) * np.exp(-tt / 0.7)
            trem = 0.75 + 0.25 * np.sin(2 * np.pi * 4.5 * tt)
            ph = pan(v * trem * 0.03, rng.uniform(-0.5, 0.5)); add_circ(st[0], ph[0], at); add_circ(st[1], ph[1], at)
    # 5 もや: レコードのかすれと、遠いサイレンのような音（ごく小さく）
    cr = np.zeros(n); idx = rng.integers(0, n, size=int(L * 18)); cr[idx] = rng.uniform(-1, 1, size=len(idx)); cr = circf(cr, lambda v: bp(v, 1200, 6000))
    mono += cr * 0.05
    for at in (bar * 5.3, bar * 13.1):
        m = int(5.0 * SR); tt = np.arange(m) / SR
        f = 620 + 160 * np.sin(2 * np.pi * 0.45 * tt)
        si = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * tt / 5.0) ** 2
        ph = pan(lp(si, 1400) * 0.012, 0.6); add_circ(st[0], ph[0], at); add_circ(st[1], ph[1], at)
    st += np.stack([mono, mono])
    st = st + reverb_circ(st.mean(0), 2.2, 0.22, seed=11)
    st = circf(st, lambda v: hp(v, 28))
    st /= np.max(np.abs(st)) / 0.7
    return write('menu', st, L, '56k')

# ---------------------------------------------------------------- 作戦中
def make_op():
    L = 64.0; t = t_axis(L); n = len(t); st = np.zeros((2, n)); mono = np.zeros(n)
    # 1 低い持続音（D1とわずかにずれた音）
    lfo = 0.65 + 0.35 * np.sin(2 * np.pi * t / L * 2)
    mono += (np.sin(2 * np.pi * qf(36.7, L) * t) + 0.8 * np.sin(2 * np.pi * qf(36.7 * 1.006, L) * t + 1) + 0.25 * np.sin(2 * np.pi * qf(73.4, L) * t)) * lfo * 0.15
    # 2 工業的なざわめき（帯域を絞ったノイズがゆっくり明滅）
    nz = rng.standard_normal(n); hum = circf(nz, lambda v: bp(v, 180, 900))
    mono += hum * 0.03 * (0.5 + 0.5 * np.sin(2 * np.pi * t / L * 5 + 1) ** 2)
    # 3 心音のような脈（1.5秒ごと）
    for k in range(int(L / 1.5)):
        for off, g in ((0.0, 1.0), (0.24, 0.55)):
            m = int(0.32 * SR); tt = np.arange(m) / SR
            th = np.sin(2 * np.pi * (46 + 26 * np.exp(-tt / 0.04)) * tt) * np.exp(-tt / 0.1)
            add_circ(mono, th * 0.16 * g, k * 1.5 + off)
    # 4 遠い金属音（配管・扉）
    for at, f0, pn in [(4.7, 112, -0.6), (15.9, 93, 0.5), (27.4, 140, -0.2), (39.2, 101, 0.7), (50.8, 128, -0.7), (59.6, 86, 0.3)]:
        ph = pan(metal_hit(f0) * 0.09, pn); add_circ(st[0], ph[0], at); add_circ(st[1], ph[1], at)
    # 5 不安な弦（ゆっくりふくらむ短2度）
    strings = np.zeros(n)
    for f in (146.83, 155.56, 220.0):
        for det in (-6, 6): strings += saw(qf(f * 2 ** (det / 1200), L), t, rng.uniform(0, 6))
    strings = circf(strings, lambda v: bp(v, 200, 1600))
    swell = (0.5 - 0.5 * np.cos(2 * np.pi * t / (L / 2))) ** 2
    mono += strings * swell * 0.012
    # 6 無線の雑音（たまに）
    for at, pn in [(10.5, -0.4), (33.3, 0.5), (55.0, 0.1)]:
        m = int(0.7 * SR); tt = np.arange(m) / SR
        r = bp(rng.standard_normal(m), 900, 3200) * (np.sin(np.pi * tt / 0.7) ** 0.5) * (0.6 + 0.4 * np.sign(np.sin(2 * np.pi * 13 * tt)))
        ph = pan(r * 0.02, pn); add_circ(st[0], ph[0], at); add_circ(st[1], ph[1], at)
    # 7 高いハーモニクス（かすか）
    for at, f in [(21.0, 2350), (45.0, 2490)]:
        m = int(5.0 * SR); tt = np.arange(m) / SR
        w = np.sin(2 * np.pi * np.cumsum(f * (1 + 0.003 * np.sin(2 * np.pi * 5 * tt))) / SR) * np.sin(np.pi * tt / 5.0) ** 2
        add_circ(st[0], w * 0.006, at); add_circ(st[1], w * 0.006, at + 0.011)
    st += np.stack([mono, mono])
    st = st * 0.85 + reverb_circ(st.mean(0), 3.0, 0.4, seed=13)
    st = circf(st, lambda v: hp(v, 24))
    st /= np.max(np.abs(st)) / 0.6
    return write('op', st, L, '48k')

# ---------------------------------------------------------------- 対戦
def make_pvp():
    bpm = 96; beat = 60 / bpm; bar = beat * 4; L = bar * 16
    t = t_axis(L); n = len(t); st = np.zeros((2, n)); mono = np.zeros(n)
    # 1 刻む低いシンセ（8分、D）
    seq = [38, 38, 38, 41, 38, 38, 36, 38]
    for b in range(16):
        for e in range(8):
            mm = seq[e] + (2 if b % 8 >= 6 else 0)
            m = int(beat / 2 * 0.9 * SR); tt = np.arange(m) / SR
            f = midi(mm)
            v = lp(saw(f, tt) + 0.5 * saw(f * 2.003, tt), 380 + 260 * (b % 4) / 3) * env_ar(m, 0.004, beat * 0.4, 2.0)
            add_circ(mono, v * 0.11, b * bar + e * beat / 2)
    # 2 ひかえめな4つ打ち・刻む金物
    for b in range(16):
        for q in range(4): add_circ(mono, kick(0.2, 44) * 0.3, b * bar + q * beat)
        for s16 in range(16):
            ph = pan(hat(0.012 if s16 % 4 else 0.025, 0.035 if s16 % 4 == 2 else 0.02), 0.4 if s16 % 2 else -0.3)
            add_circ(st[0], ph[0], b * bar + s16 * beat / 4); add_circ(st[1], ph[1], b * bar + s16 * beat / 4)
    # 3 4小節ごとに上がる緊張の弦
    for b0 in range(0, 16, 4):
        m = int(bar * 4 * SR); tt = np.arange(m) / SR
        f = 220 * 2 ** (tt / (bar * 4) * 0.5)
        v = np.zeros(m)
        for det in (-7, 0, 7): v += saw(f * 2 ** (det / 1200), tt, rng.uniform(0, 6))
        v = bp(v, 300, 3000) * (tt / (bar * 4)) ** 2
        add_circ(mono, v * 0.018, b0 * bar)
    # 4 2小節ごとの低い一撃
    for b in range(0, 16, 2):
        m = int(1.0 * SR); tt = np.arange(m) / SR
        br_ = saw(36.7, tt) + saw(55.0, tt) + 0.5 * saw(73.4, tt)
        add_circ(mono, lp(soft(br_ * 2.2, 2.2), 800) * env_ar(m, 0.01, 0.6, 2.0) * 0.12, b * bar)
    st += np.stack([mono, mono])
    st = st + reverb_circ(st.mean(0), 1.5, 0.2, seed=17)
    st = circf(st, lambda v: hp(v, 30))
    st /= np.max(np.abs(st)) / 0.7
    return write('pvp', st, L, '56k')

meta = {'menu': make_menu(), 'op': make_op(), 'pvp': make_pvp()}
with open(os.path.join(OUT, 'music.json'), 'w') as f: json.dump(meta, f, indent=1)
print(json.dumps(meta))
