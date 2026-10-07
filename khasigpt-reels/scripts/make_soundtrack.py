"""Mix the score with frame-accurate sound effects.

Reads  public/reel-music.wav (from make_music.py) and public/click.wav (UI tap sample),
writes public/reel-soundtrack.wav (48 kHz stereo, 16-bit), the file the Reel plays.

Cue frames are global frames at 60 fps and mirror the scene timings in src/scenes.
"""

from pathlib import Path
import wave

import numpy as np
from scipy import signal

ROOT = Path(__file__).resolve().parents[1]
SR = 48000
FPS = 60
rng = np.random.default_rng(45)

# scene offsets (frames)
S1, S2, S3, S4, S5, S6, S7 = 0, 180, 660, 1020, 1500, 1860, 2220


def read_wav(path):
    with wave.open(str(path)) as w:
        sr, ch, n = w.getframerate(), w.getnchannels(), w.getnframes()
        x = np.frombuffer(w.readframes(n), dtype="<i2").astype(np.float64) / 32768
    x = x.reshape(-1, ch)
    if ch == 1:
        x = np.repeat(x, 2, axis=1)
    if sr != SR:
        x = signal.resample_poly(x, SR, sr, axis=0)
    return x


def tt(d):
    return np.arange(int(d * SR)) / SR


def stereo(x, pan=0.0):
    return np.stack([x * np.sqrt((1 - pan) / 2), x * np.sqrt((1 + pan) / 2)], axis=1)


def bp(x, lo, hi, order=2):
    sos = signal.butter(order, [lo / (SR / 2), hi / (SR / 2)], btype="band", output="sos")
    return signal.sosfilt(sos, x, axis=0)


def hp(x, fc, order=2):
    return signal.sosfilt(signal.butter(order, fc / (SR / 2), btype="high", output="sos"), x, axis=0)


def lp(x, fc, order=2):
    return signal.sosfilt(signal.butter(order, fc / (SR / 2), btype="low", output="sos"), x, axis=0)


# ------------------------------------------------------------------ sounds
def tick(seed):
    r = np.random.default_rng(seed)
    t = tt(0.045)
    n = r.normal(0, 1, len(t)) * np.exp(-t * 260)
    body = np.sin(2 * np.pi * (1800 + r.random() * 900) * t) * np.exp(-t * 180) * 0.35
    thock = np.sin(2 * np.pi * (180 + r.random() * 40) * t) * np.exp(-t * 90) * 0.5
    y = hp(n, 1500) * 0.6 + body + thock
    return stereo(y * 0.5, (r.random() - 0.5) * 0.5)


def whoosh(dur=0.6, up=True, pan_from=-0.6, pan_to=0.6, bright=1.0):
    t = tt(dur)
    n = rng.normal(0, 1, len(t))
    env = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** (1.4 if up else 0.9)
    if not up:
        env = np.exp(-t / (dur * 0.35)) * np.minimum(1, t / 0.02)
    # sweep a band-pass by processing in blocks
    out = np.zeros(len(t))
    zi = None
    block = 256
    for i in range(0, len(t), block):
        p = i / len(t)
        fc = (400 + 2600 * (np.sin(np.pi * p) if up else (1 - p))) * bright
        sos = signal.butter(2, [max(80, fc * 0.55) / (SR / 2), min(SR / 2 * 0.95, fc * 1.6) / (SR / 2)], btype="band", output="sos")
        if zi is None:
            zi = np.zeros((sos.shape[0], 2))
        out[i:i + block], zi = signal.sosfilt(sos, n[i:i + block], zi=zi)
    y = out * env
    pan = np.linspace(pan_from, pan_to, len(t))
    return np.stack([y * np.sqrt((1 - pan) / 2), y * np.sqrt((1 + pan) / 2)], axis=1)


def pop(freq=620, dur=0.12):
    t = tt(dur)
    f = freq * (1 + 0.6 * np.exp(-t * 60))
    ph = 2 * np.pi * np.cumsum(f) / SR
    y = np.sin(ph) * np.exp(-t * 34) + rng.normal(0, 1, len(t)) * np.exp(-t * 400) * 0.15
    return stereo(y * 0.7)


def bell(freq, dur=1.2, bright=2.0, decay=4.0):
    t = tt(dur)
    mod = np.sin(2 * np.pi * freq * 3.01 * t) * bright * np.exp(-t * 7)
    y = np.sin(2 * np.pi * freq * t + mod) * np.exp(-t * decay) * np.minimum(1, t / 0.003)
    return y


def chime(notes=(1318.5, 1975.5), gap=0.07):
    out = np.zeros(int((gap * len(notes) + 1.3) * SR))
    for i, n in enumerate(notes):
        b = bell(n, 1.2, 1.6, 5)
        s = int(i * gap * SR)
        out[s:s + len(b)] += b
    return stereo(out * 0.45)


def clang():
    t = tt(1.4)
    partials = [(523, 1.0, 5), (1271, 0.6, 7), (2113, 0.45, 9), (3337, 0.3, 12), (4870, 0.18, 16)]
    y = sum(a * np.sin(2 * np.pi * f * t + rng.random() * 6) * np.exp(-t * d) for f, a, d in partials)
    thump = np.sin(2 * np.pi * (55 + 60 * np.exp(-t * 30)) * t) * np.exp(-t * 9) * 1.2
    crack = hp(rng.normal(0, 1, len(t)), 3000) * np.exp(-t * 70) * 0.5
    return stereo((y * 0.35 + thump + crack) * 0.6)


def sparkle(dur=0.9, density=38, seed=3):
    r = np.random.default_rng(seed)
    out = np.zeros((int((dur + 0.6) * SR), 2))
    for _ in range(density):
        t0 = r.random() ** 1.6 * dur
        f = 2600 + r.random() * 5200
        b = bell(f, 0.5, 0.8, 11) * (0.25 + r.random() * 0.5) * (1 - t0 / dur * 0.6)
        s = int(t0 * SR)
        out[s:s + len(b)] += stereo(b, r.random() * 1.6 - 0.8)
    return out * 0.35


def swell(dur=0.8):
    t = tt(dur)
    n = lp(rng.normal(0, 1, len(t)), 5000)
    env = (t / dur) ** 2.5
    return stereo(hp(n, 600) * env * 0.5)


def thud(freq=70):
    t = tt(0.5)
    y = np.sin(2 * np.pi * (freq + 80 * np.exp(-t * 40)) * t) * np.exp(-t * 10)
    y += hp(rng.normal(0, 1, len(t)), 1200) * np.exp(-t * 90) * 0.25
    return stereo(y * 0.8)


CLICK = read_wav(ROOT / "public" / "click.wav")[: int(0.25 * SR)]

# ------------------------------------------------------------------ cue sheet (global frames)
cues = []


def cue(frame, sound, gain):
    cues.append((frame, sound, gain))


def typing(start, count, fpc, gain=0.16, every=1):
    for i in range(0, count, every):
        cue(start + i * fpc, tick(int(start * 10 + i)), gain * (0.8 + 0.4 * rng.random()))


# S1 · logo + hook
cue(S1 + 0, whoosh(0.45, True, 0.5, -0.4, 1.3), 0.45)
cue(S1 + 20, clang(), 0.55)
cue(S1 + 46, sparkle(0.5, 18, 1), 0.5)
cue(S1 + 78, thud(90), 0.22)
cue(S1 + 86, thud(75), 0.30)
cue(S1 + 95, thud(60), 0.40)
cue(S1 + 98, sparkle(0.6, 24, 2), 0.45)
cue(S1 + 146, swell(0.5), 0.35)

# S2 · chat
cue(S2 + 0, whoosh(0.5, True, -0.3, 0.3, 1.1), 0.32)
typing(S2 + 50, 29, 2, 0.15)
cue(S2 + 118, CLICK, 0.55)
cue(S2 + 122, whoosh(0.55, True, 0.2, -0.2, 0.9), 0.40)
cue(S2 + 164, pop(560), 0.30)
cue(S2 + 166, chime((987.8, 1318.5)), 0.22)
cue(S2 + 212, whoosh(0.35, False, 0, 0, 1.2), 0.22)
for i in range(0, 170, 9):
    cue(S2 + 236 + i, tick(900 + i), 0.05)
cue(S2 + 438, whoosh(0.7, True, -0.7, 0.7, 1.0), 0.55)

# S3 · voice
cue(S3 + 4, whoosh(0.5, False, 0.6, -0.2, 1.0), 0.3)
cue(S3 + 26, whoosh(0.45, True, 0, 0, 1.4), 0.3)
cue(S3 + 40, chime((1046.5, 1568.0)), 0.32)
cue(S3 + 150, pop(420, 0.1), 0.18)
cue(S3 + 184, chime((1568.0, 1046.5)), 0.26)
cue(S3 + 312, whoosh(0.4, False, 0, 0, 1.0), 0.25)
cue(S3 + 334, whoosh(0.5, True, 0, 0, 1.3), 0.45)

# S4 · image generation
cue(S4 + 0, whoosh(0.5, True, 0.3, -0.3, 1.1), 0.30)
cue(S4 + 50, CLICK, 0.5)
cue(S4 + 52, pop(760, 0.1), 0.22)
typing(S4 + 64, 54, 1.3, 0.13, every=2)
cue(S4 + 142, CLICK, 0.55)
cue(S4 + 146, whoosh(0.55, True, 0.2, -0.2, 0.9), 0.38)
cue(S4 + 194, swell(0.75), 0.30)
cue(S4 + 240, sparkle(1.1, 60, 7), 0.75)
cue(S4 + 240, chime((1318.5, 1975.5, 2637.0)), 0.3)
cue(S4 + 280, pop(700), 0.25)
cue(S4 + 386, whoosh(0.5, False, 0, 0, 1.0), 0.28)
cue(S4 + 430, whoosh(0.6, True, 0.6, -0.8, 1.0), 0.45)

# S5 · explore + features
cue(S5 + 0, whoosh(0.6, False, 0.8, 0, 1.0), 0.42)
for k, f in enumerate((70, 84, 98)):
    cue(S5 + f, pop(520 + k * 90), 0.28)
    cue(S5 + f, whoosh(0.3, True, 0, (-0.5, 0.5, -0.5)[k], 1.5), 0.16)
cue(S5 + 152, whoosh(0.45, False, 0, 0, 1.0), 0.3)
cue(S5 + 182, whoosh(0.4, True, -0.6, 0.2, 1.2), 0.25)
for i in range(8):
    cue(S5 + 216 + i * 7, pop(560 + i * 55, 0.1), 0.2)
cue(S5 + 300, swell(1.0), 0.45)

# S6 · montage
cue(S6 + 66, pop(480), 0.3)
typing(S6 + 84, 23, 2.7, 0.15)
cue(S6 + 252, whoosh(0.4, True, 0, 0, 1.4), 0.25)
cue(S6 + 292, swell(1.0), 0.40)

# S7 · finale
cue(S7 + 0, whoosh(0.4, True, 0.4, -0.4, 1.4), 0.4)
cue(S7 + 20, clang(), 0.6)
cue(S7 + 34, sparkle(0.6, 26, 9), 0.45)
cue(S7 + 126, pop(500), 0.28)
typing(S7 + 150, 12, 4, 0.16)
cue(S7 + 212, CLICK, 0.6)
cue(S7 + 214, chime((1318.5, 1760.0, 2637.0)), 0.32)
cue(S7 + 226, sparkle(0.7, 30, 11), 0.4)

# ------------------------------------------------------------------ mix
music = read_wav(ROOT / "public" / "reel-music.wav")
N = len(music)
sfx = np.zeros_like(music)
for frame, sound, gain in cues:
    s = int(round(frame / FPS * SR))
    if s >= N:
        continue
    e = min(N, s + len(sound))
    sfx[s:e] += sound[: e - s] * gain

# short room on the effects so they sit with the score
ir_t = tt(0.6)
ir = rng.normal(0, 1, (len(ir_t), 2)) * np.exp(-ir_t * 9)[:, None]
ir = lp(ir, 6000)
ir /= np.sqrt(np.sum(ir ** 2, axis=0, keepdims=True))
wet = np.stack([signal.fftconvolve(sfx[:, c], ir[:, c])[:N] for c in range(2)], axis=1)
sfx = sfx + wet * 0.18

mix = music * 0.86 + sfx * 0.9
# soft limiter
mix = np.tanh(mix * 1.1) / np.tanh(1.1)
mix = mix / np.max(np.abs(mix)) * 0.93
out = ROOT / "public" / "reel-soundtrack.wav"
with wave.open(str(out), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((np.clip(mix, -1, 1) * 32767).astype("<i2").tobytes())
rms = np.sqrt(np.mean(mix ** 2))
print(out, f"{len(cues)} cues, rms {20 * np.log10(rms):.1f} dBFS, {N / SR:.2f}s")
