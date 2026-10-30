# 声が聞き取れるかの確認: Whisper（base.en, ONNX）で文字に起こす。
#   python3 -I tools/asr.py <モデルのフォルダ> <wav...>   → 1行ずつ「ファイル<TAB>聞き取った文」
# 外部のプログラムは使わず、numpy と onnxruntime（作業環境に入っているもの）だけで動かす。
import sys, os, wave, base64
import numpy as np
import onnxruntime as ort

SR = 16000; N_FFT = 400; HOP = 160; N_MELS = 80; N_FRAMES = 3000

def load_wav(p):
    w = wave.open(p); sr = w.getframerate(); ch = w.getnchannels(); sw = w.getsampwidth()
    x = np.frombuffer(w.readframes(w.getnframes()), dtype={2: np.int16, 4: np.int32}[sw]).astype(np.float32)
    x /= 32768.0 if sw == 2 else 2147483648.0
    if ch > 1: x = x.reshape(-1, ch).mean(1)
    if sr != SR:
        t = np.arange(int(len(x) * SR / sr)) * sr / SR
        x = np.interp(t, np.arange(len(x)), x).astype(np.float32)
    return x

def mel_filters(sr=SR, n_fft=N_FFT, n_mels=N_MELS):
    # librosa の slaney 式（Whisper と同じ）
    def hz_to_mel(f):
        f = np.asarray(f, dtype=np.float64); m = f / (200.0 / 3)
        log = f >= 1000.0; m = np.where(log, 15.0 + np.log(np.maximum(f, 1e-10) / 1000.0) / (np.log(6.4) / 27.0), m); return m
    def mel_to_hz(m):
        m = np.asarray(m, dtype=np.float64); f = m * (200.0 / 3)
        log = m >= 15.0; f = np.where(log, 1000.0 * np.exp((np.log(6.4) / 27.0) * (m - 15.0)), f); return f
    fft_f = np.linspace(0, sr / 2, 1 + n_fft // 2)
    mel_f = mel_to_hz(np.linspace(hz_to_mel(0), hz_to_mel(sr / 2), n_mels + 2))
    fd = np.diff(mel_f); ramps = mel_f[:, None] - fft_f[None, :]
    w = np.zeros((n_mels, len(fft_f)))
    for i in range(n_mels):
        lo = -ramps[i] / fd[i]; hi = ramps[i + 2] / fd[i + 1]
        w[i] = np.maximum(0, np.minimum(lo, hi))
    enorm = 2.0 / (mel_f[2:n_mels + 2] - mel_f[:n_mels]); w *= enorm[:, None]
    return w.astype(np.float32)

MEL = mel_filters()
def log_mel(x):
    x = np.pad(x, (N_FFT // 2, N_FFT // 2), mode='reflect')
    win = np.hanning(N_FFT + 1)[:-1].astype(np.float32)
    n = 1 + (len(x) - N_FFT) // HOP
    fr = np.stack([x[i * HOP:i * HOP + N_FFT] * win for i in range(n)])
    spec = np.abs(np.fft.rfft(fr, axis=1)) ** 2
    spec = spec[:-1] if spec.shape[0] > 1 else spec
    mel = MEL @ spec.T
    lg = np.log10(np.maximum(mel, 1e-10))
    lg = np.maximum(lg, lg.max() - 8.0)
    lg = (lg + 4.0) / 4.0
    if lg.shape[1] < N_FRAMES: lg = np.pad(lg, ((0, 0), (0, N_FRAMES - lg.shape[1])), constant_values=lg.min() if lg.size else 0)
    return lg[:, :N_FRAMES].astype(np.float32)

class Whisper:
    def __init__(self, d):
        o = ort.SessionOptions(); o.intra_op_num_threads = 2
        self.enc = ort.InferenceSession(os.path.join(d, 'base.en-encoder.int8.onnx'), o, providers=['CPUExecutionProvider'])
        self.dec = ort.InferenceSession(os.path.join(d, 'base.en-decoder.int8.onnx'), o, providers=['CPUExecutionProvider'])
        meta = self.enc.get_modelmeta().custom_metadata_map
        self.sot = int(meta['sot']); self.eot = int(meta['eot']); self.nots = int(meta['no_timestamps'])
        self.tok = {}
        for line in open(os.path.join(d, 'base.en-tokens.txt'), encoding='utf8'):
            b, i = line.rsplit(' ', 1); self.tok[int(i)] = base64.b64decode(b)
    def __call__(self, x):
        mel = log_mel(x)[None]
        ck, cv = self.enc.run(None, {'mel': mel})
        kc = np.zeros((6, 1, 448, 512), np.float32); vc = np.zeros((6, 1, 448, 512), np.float32)
        toks = [self.sot, self.nots]
        logits, kc, vc = self.dec.run(None, {'tokens': np.array([toks], np.int64), 'in_n_layer_self_k_cache': kc, 'in_n_layer_self_v_cache': vc, 'n_layer_cross_k': ck, 'n_layer_cross_v': cv, 'offset': np.array([0], np.int64)})
        out = []; off = len(toks)
        for _ in range(60):
            t = int(np.argmax(logits[0, -1]))
            if t == self.eot or t >= 50257: break
            out.append(t)
            logits, kc, vc = self.dec.run(None, {'tokens': np.array([[t]], np.int64), 'in_n_layer_self_k_cache': kc, 'in_n_layer_self_v_cache': vc, 'n_layer_cross_k': ck, 'n_layer_cross_v': cv, 'offset': np.array([off], np.int64)})
            off += 1
        return b''.join(self.tok.get(t, b'') for t in out).decode('utf8', 'replace').strip()

if __name__ == '__main__':
    W = Whisper(sys.argv[1])
    for p in sys.argv[2:]:
        print(p + '\t' + W(load_wav(p)), flush=True)
