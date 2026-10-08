"""Synthesised sound effects shared by the soundtrack scripts (48 kHz stereo)."""

import wave

import numpy as np
from scipy import signal

SR = 48000
rng = np.random.default_rng(45)


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
