"""Original 120 BPM score for the KhasiGPT Instagram Reel.

Everything is synthesised here with NumPy + SciPy; no third-party samples.
Downbeats fall on odd seconds (1, 3, 5, ...), so every scene cut in the
video (3, 11, 17, 21, 25, 31, 37 s) lands on a bar line.

Output: public/reel-music.wav (48 kHz, stereo, 16-bit)
"""

from pathlib import Path
import wave

import numpy as np
from scipy import signal

SR = 48000
DUR = 45.0
N = int(SR * DUR)
BEAT = 0.5
BAR = 2.0
rng = np.random.default_rng(20261008)


def bar_t(b: float) -> float:
    """Time in seconds of bar b (bar 0 starts at 1.0 s)."""
    return 1.0 + b * BAR


def midi(n: float) -> float:
    return 440.0 * 2 ** ((n - 69) / 12)


class Bus:
    def __init__(self):
        self.x = np.zeros((N, 2))

    def add(self, snd, t, gain=1.0, pan=0.0):
        if snd.ndim == 1:
            l = np.sqrt((1 - pan) / 2)
            r = np.sqrt((1 + pan) / 2)
            snd = np.stack([snd * l, snd * r], axis=1)
        start = int(round(t * SR))
        if start >= N:
            return
        if start < 0:
            snd = snd[-start:]
            start = 0
        end = min(N, start + len(snd))
        self.x[start:end] += snd[: end - start] * gain


def tt(dur):
    return np.arange(int(dur * SR)) / SR


def polyblep_saw(freq, dur, phase0=0.0):
    n = int(dur * SR)
    dt = freq / SR
    ph = (phase0 + dt * np.arange(n)) % 1.0
    y = 2 * ph - 1
    # polyBLEP correction
    m1 = ph < dt
    t1 = ph[m1] / dt
    y[m1] -= t1 + t1 - t1 * t1 - 1
    m2 = ph > 1 - dt
    t2 = (ph[m2] - 1) / dt
    y[m2] -= t2 * t2 + t2 + t2 + 1
    return y


def adsr(n, a, d, s, r, sustain_len=None):
    a_n, d_n, r_n = int(a * SR), int(d * SR), int(r * SR)
    if sustain_len is None:
        sustain_len = max(0, n - a_n - d_n - r_n)
    env = np.concatenate([
        np.linspace(0, 1, max(1, a_n)) ** 1.6,
        np.linspace(1, s, max(1, d_n)),
        np.full(max(0, sustain_len), s),
        np.linspace(s, 0, max(1, r_n)) ** 1.4 * 1.0,
    ])
    if len(env) < n:
        env = np.concatenate([env, np.zeros(n - len(env))])
    return env[:n]


def sos_filter(kind, fc, order=2, q=None):
    nyq = SR / 2
    if kind == "band":
        return signal.butter(order, [fc[0] / nyq, fc[1] / nyq], btype="band", output="sos")
    return signal.butter(order, min(0.999, fc / nyq), btype=kind, output="sos")


def filt(x, kind, fc, order=2):
    sos = sos_filter(kind, fc, order)
    if x.ndim == 2:
        return np.stack([signal.sosfilt(sos, x[:, 0]), signal.sosfilt(sos, x[:, 1])], axis=1)
    return signal.sosfilt(sos, x)


def sweep_lowpass(x, fc_curve, block=256):
    """Time-varying 2-pole lowpass. fc_curve: array same length as x (Hz)."""
    mono = x.ndim == 1
    xs = x[:, None] if mono else x
    out = np.zeros_like(xs)
    zi = None
    for i in range(0, len(xs), block):
        fc = float(np.clip(fc_curve[min(i, len(fc_curve) - 1)], 40, SR / 2 * 0.95))
        sos = signal.butter(2, fc / (SR / 2), btype="low", output="sos")
        if zi is None:
            zi = np.zeros((sos.shape[0], 2, xs.shape[1]))
        seg = xs[i:i + block]
        for c in range(xs.shape[1]):
            out[i:i + block, c], zi[:, :, c] = signal.sosfilt(sos, seg[:, c], zi=zi[:, :, c])
    return out[:, 0] if mono else out


def make_ir(seconds=2.8, predelay=0.025, damp=5200, seed=7):
    r = np.random.default_rng(seed)
    n = int(seconds * SR)
    t = np.arange(n) / SR
    decay = np.exp(-6.9 * t / seconds)
    ir = r.normal(0, 1, (n, 2)) * decay[:, None]
    ir = filt(ir, "low", damp)
    ir = filt(ir, "high", 180)
    pd = np.zeros((int(predelay * SR), 2))
    ir = np.concatenate([pd, ir])
    ir /= np.sqrt(np.sum(ir ** 2, axis=0, keepdims=True))
    return ir


def reverb(x, ir):
    out = np.stack([signal.fftconvolve(x[:, 0], ir[:, 0])[:N], signal.fftconvolve(x[:, 1], ir[:, 1])[:N]], axis=1)
    return out


def pingpong(x, delay=0.375, fb=0.38, taps=6, damp=4200):
    out = np.zeros_like(x)
    d = int(delay * SR)
    cur = filt(x, "low", damp)
    for k in range(1, taps + 1):
        cur = cur * fb
        shift = d * k
        if shift >= N:
            break
        side = 0 if k % 2 else 1
        out[shift:, side] += cur[: N - shift, 0] + cur[: N - shift, 1]
    return out


# ---------------------------------------------------------------- harmony
CHORDS = {
    "F": {"root": midi(29), "pad": [53, 57, 60, 64, 67]},    # Fmaj9
    "G": {"root": midi(31), "pad": [55, 59, 62, 64, 69]},    # G6/9
    "Am": {"root": midi(33), "pad": [57, 60, 64, 67, 71]},   # Am9
    "C": {"root": midi(36), "pad": [55, 60, 64, 67, 74]},    # Cadd9
}
LOOP = ["F", "G", "Am", "C"]
FINALE = {18: "F", 19: "G", 20: "C", 21: "C"}


def chord_for(b):
    return FINALE.get(b, LOOP[b % 4])


# section helpers (seconds)
def in_range(t, a, b):
    return a <= t < b


pad = Bus()
arp = Bus()
bass = Bus()
drums = Bus()
fx = Bus()
lead = Bus()
verb_send = Bus()

# ---------------------------------------------------------------- pad
for b in range(-1, 22):
    t0 = bar_t(b)
    if t0 >= DUR:
        break
    name = chord_for(b) if b >= 0 else "F"
    notes = CHORDS[name]["pad"]
    dur = BAR + 0.9
    if b == 21:
        dur = DUR - t0
    start = max(0.0, t0)
    length = dur - (start - t0)
    if length <= 0:
        continue
    # dynamics per section
    if t0 < 1:
        g = 0.05
    elif t0 < 3:
        g = 0.11
    elif t0 < 11:
        g = 0.10
    elif t0 < 17:
        g = 0.16
    elif t0 < 21:
        g = 0.12
    elif t0 < 37:
        g = 0.105
    else:
        g = 0.19
    chord = np.zeros((int(length * SR), 2))
    for i, n in enumerate(notes):
        f = midi(n)
        for v in range(6):
            det = (v - 2.5) * 0.11  # semitone cents spread
            fv = f * 2 ** (det / 12)
            s = polyblep_saw(fv, length, rng.random())
            pan = -0.85 + 1.7 * (v / 5)
            chord[:, 0] += s * np.sqrt((1 - pan) / 2)
            chord[:, 1] += s * np.sqrt((1 + pan) / 2)
    env = adsr(len(chord), 0.35, 0.4, 0.85, 0.85)
    chord *= env[:, None] / (len(notes) * 6) * 3.2
    cutoff = 2400 if t0 < 37 else 3600
    if in_range(t0, 11, 17):
        cutoff = 1600
    chord = filt(chord, "low", cutoff, 2)
    pad.add(chord, start, g)

# pad filter sweep in the intro (opens 0 -> 3 s)
curve = np.full(N, 20000.0)
ti = np.arange(N) / SR
curve = np.where(ti < 3.0, 500 * (40 ** np.clip(ti / 3.0, 0, 1)), curve)
pad.x = sweep_lowpass(pad.x, curve)

# ---------------------------------------------------------------- arp (pluck)
def pluck(freq, dur=0.32, bright=5200):
    n = int(dur * SR)
    t = np.arange(n) / SR
    s = polyblep_saw(freq, dur) * 0.7 + np.sign(np.sin(2 * np.pi * freq * t)) * 0.25
    env = np.minimum(1, t / 0.003) * np.exp(-t * 11)
    fc = 300 + bright * np.exp(-t * 26)
    y = sweep_lowpass(s * env, fc, block=64)
    return y


PATTERN = [0, 2, 1, 3, 2, 4, 3, 1, 0, 2, 4, 3, 2, 1, 3, 4]
pluck_cache = {}
for b in range(0, 18):
    t0 = bar_t(b)
    name = chord_for(b)
    notes = CHORDS[name]["pad"]
    for j in range(16):
        t = t0 + j * BEAT / 4
        if t >= DUR:
            break
        # sections where arp plays
        if in_range(t, 11, 17):
            if j % 4 != 0:  # sparse in the voice breakdown
                continue
            gain = 0.10
        elif in_range(t, 17, 21):
            gain = 0.08 + 0.06 * (t - 17) / 4
        elif t < 3:
            gain = 0.09
        else:
            gain = 0.14
        n = notes[PATTERN[j] % len(notes)] + (12 if j in (6, 14) else 0)
        key = (n, 1)
        if key not in pluck_cache:
            pluck_cache[key] = pluck(midi(n))
        acc = 1.0 if j % 4 == 0 else (0.72 if j % 2 == 0 else 0.55)
        arp.add(pluck_cache[key], t, gain * acc, pan=(-0.35 if j % 2 else 0.35))

# arp intro sweep (filter opens through the hook)
curve = np.where(ti < 3.0, 700 * (18 ** np.clip(ti / 3.0, 0, 1)), 20000.0)
arp.x = sweep_lowpass(arp.x, curve)
arp.x += pingpong(arp.x, 0.375, 0.34)

# ---------------------------------------------------------------- bass
for b in range(0, 22):
    t0 = bar_t(b)
    if t0 >= DUR:
        break
    if t0 < 3:
        continue
    name = chord_for(b)
    f = CHORDS[name]["root"]
    dur = BAR if b < 21 else DUR - t0
    t = tt(dur)
    s = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * 2 * f * t) + 0.12 * np.sin(2 * np.pi * 3 * f * t)
    s = np.tanh(s * 1.4)
    env = adsr(len(t), 0.01, 0.2, 0.9, 0.12)
    g = 0.32
    if in_range(t0, 11, 17):
        g = 0.22
    if in_range(t0, 17, 21):
        g = 0.24
    if t0 >= 37:
        g = 0.30 if t0 < 41 else 0.22
    bass.add(s * env, t0, g)

# ---------------------------------------------------------------- drums
def kick():
    t = tt(0.42)
    f = 46 + 95 * np.exp(-t * 32)
    ph = 2 * np.pi * np.cumsum(f) / SR
    k = np.sin(ph) * np.exp(-t * 7.5)
    k += rng.normal(0, 1, len(t)) * np.exp(-t * 260) * 0.18
    return np.tanh(k * 1.6) * 0.9


def clap():
    t = tt(0.32)
    n = rng.normal(0, 1, len(t))
    env = np.zeros(len(t))
    for o in (0, 0.011, 0.022):
        env += (t >= o) * np.exp(-np.clip(t - o, 0, None) * (90 if o < 0.02 else 18))
    y = filt(n * env, "band", (900, 3800))
    return y * 0.9


def hat(open_=False):
    t = tt(0.26 if open_ else 0.06)
    n = rng.normal(0, 1, len(t))
    y = filt(n, "high", 7500, 2) * np.exp(-t * (16 if open_ else 95))
    return y


def snare():
    t = tt(0.25)
    n = filt(rng.normal(0, 1, len(t)), "band", (1200, 7000)) * np.exp(-t * 22)
    body = np.sin(2 * np.pi * 190 * t) * np.exp(-t * 30) * 0.5
    return n * 0.8 + body


K, CL, HC, HO, SN = kick(), clap(), hat(), hat(True), snare()
kick_times = []


def drums_section(t_start, t_end, mode):
    b0 = int(round((t_start - 1.0) / BEAT))
    b1 = int(round((t_end - 1.0) / BEAT))
    for beat_i in range(b0, b1):
        t = 1.0 + beat_i * BEAT
        pos = beat_i % 4  # 0 = downbeat
        if mode in ("full", "peak"):
            drums.add(K, t, 0.62)
            kick_times.append(t)
            if pos in (1, 3):
                drums.add(CL, t, 0.30, 0.05)
            drums.add(HO, t + BEAT / 2, 0.075 if mode == "full" else 0.095, 0.25)
            for s16 in range(4):
                if s16 == 2:
                    continue
                drums.add(HC, t + s16 * BEAT / 4, (0.05 if s16 == 0 else 0.035) * (1.25 if mode == "peak" else 1), -0.3 if s16 % 2 else 0.3)
        elif mode == "half":
            if pos == 0:
                drums.add(K, t, 0.55)
                kick_times.append(t)
            if pos == 2:
                drums.add(CL, t, 0.26)
            drums.add(HC, t + BEAT / 2, 0.035, 0.3)
        elif mode == "pulse":
            if pos == 0:
                drums.add(K, t, 0.28)
                kick_times.append(t)
            drums.add(HC, t + BEAT / 2, 0.018, 0.4)
        elif mode == "finale":
            if pos == 0:
                drums.add(K, t, 0.5)
                kick_times.append(t)
            if pos == 2:
                drums.add(CL, t, 0.2)


# Hook: ticking 16th hats building in, no kick until the drop
for i in range(int(1.0 / (BEAT / 4)), int(3.0 / (BEAT / 4))):
    t = i * BEAT / 4
    g = 0.012 + 0.04 * (t / 3.0)
    drums.add(HC, t, g, -0.3 if i % 2 else 0.3)

drums_section(3, 11, "full")
drums_section(11, 17, "pulse")
drums_section(17, 21, "half")
drums_section(21, 31, "full")
drums_section(31, 36.5, "peak")
drums_section(37, 41, "finale")

# snare rolls into drops
def roll(t_start, t_end, g0=0.04, g1=0.26):
    steps = int((t_end - t_start) / (BEAT / 4))
    for i in range(steps):
        t = t_start + i * BEAT / 4
        if t_end - t > 0.5:
            if i % 2:
                continue
        g = g0 + (g1 - g0) * (i / max(1, steps - 1))
        drums.add(SN, t, g, 0.1)


roll(2.0, 2.9)
roll(20.0, 20.9)
roll(30.0, 30.9, 0.05, 0.22)
roll(36.0, 36.85, 0.06, 0.28)

# ---------------------------------------------------------------- FX: risers, impacts, crashes, reverse swells
def riser(dur):
    t = tt(dur)
    n = rng.normal(0, 1, (len(t), 2))
    fc = 400 * (30 ** (t / dur))
    y = sweep_lowpass(n, fc)
    y = filt(y, "high", 300)
    tone = polyblep_saw(1, dur)  # placeholder to keep shapes aligned
    f = 220 * 2 ** (t / dur * 2)
    ph = 2 * np.pi * np.cumsum(f) / SR
    pitch = (np.sin(ph) + 0.4 * np.sin(2 * ph)) * 0.18
    env = (t / dur) ** 2.2
    out = (y * 0.55 + pitch[:, None]) * env[:, None]
    return out


def impact(size=1.0):
    t = tt(2.6)
    f = 32 + 48 * np.exp(-t * 5)
    ph = 2 * np.pi * np.cumsum(f) / SR
    sub = np.sin(ph) * np.exp(-t * 1.9)
    nz = filt(rng.normal(0, 1, len(t)), "low", 2600) * np.exp(-t * 4.5) * 0.55
    crack = filt(rng.normal(0, 1, len(t)), "high", 2500) * np.exp(-t * 40) * 0.35
    y = np.tanh((sub * 1.2 + nz + crack) * 1.3) * size
    return np.stack([y, y], axis=1)


def crash():
    t = tt(2.4)
    n = rng.normal(0, 1, (len(t), 2))
    y = filt(n, "high", 4200) * np.exp(-t * 2.4)[:, None]
    return y


def reverse_swell(dur=1.0, note_set=(57, 60, 64, 69)):
    t = tt(dur)
    y = np.zeros(len(t))
    for n in note_set:
        y += polyblep_saw(midi(n), dur)
    y = filt(y, "low", 3000)
    env = (t / dur) ** 3
    y = y * env / len(note_set)
    return np.stack([y, y], axis=1)


fx.add(impact(0.9), 0.0, 0.55)
fx.add(crash(), 0.0, 0.10)
fx.add(riser(2.0), 1.0, 0.14)
fx.add(impact(1.0), 3.0, 0.42)
fx.add(crash(), 3.0, 0.14)
fx.add(reverse_swell(1.0), 10.0, 0.22)
fx.add(crash(), 11.0, 0.08)
fx.add(riser(1.0), 16.0, 0.10)
fx.add(riser(2.0), 19.0, 0.16)
fx.add(impact(1.1), 21.0, 0.5)
fx.add(crash(), 21.0, 0.16)
fx.add(crash(), 25.0, 0.10)
fx.add(riser(1.0), 30.0, 0.12)
fx.add(crash(), 31.0, 0.15)
fx.add(impact(0.8), 31.0, 0.28)
fx.add(riser(1.5), 35.5, 0.16)
fx.add(impact(1.2), 37.0, 0.62)
fx.add(crash(), 37.0, 0.18)
fx.add(impact(0.6), 41.0, 0.24)

# ---------------------------------------------------------------- lead bells (FM)
def bell(freq, dur=1.6):
    t = tt(dur)
    mod = np.sin(2 * np.pi * freq * 3.5 * t) * (2.2 * np.exp(-t * 6))
    car = np.sin(2 * np.pi * freq * t + mod)
    car += 0.3 * np.sin(2 * np.pi * freq * 2 * t) * np.exp(-t * 4)
    env = np.minimum(1, t / 0.004) * np.exp(-t * 2.6)
    return car * env


MOTIFS = {
    15: [76, None, 79, None, 81, 79, 76, None],
    16: [81, None, 79, None, 76, None, 74, 76],
    17: [74, None, 71, None, 74, 76, 79, None],
    18: [84, None, None, None, 81, None, 79, None],
    19: [79, None, None, None, 83, None, 86, None],
    20: [84, None, None, None, 79, None, 76, None],
    21: [72, None, None, None, None, None, None, None],
}
# softer early statements in the chat and feature sections
EARLY = {
    3: [None, None, None, None, 76, None, 79, None],
    13: [None, None, None, None, 76, None, 74, None],
    14: [72, None, None, None, None, None, None, None],
}
for b, motif in {**EARLY, **MOTIFS}.items():
    t0 = bar_t(b)
    for j, n in enumerate(motif):
        if n is None:
            continue
        t = t0 + j * BEAT / 2
        if t >= DUR - 0.2:
            continue
        g = 0.13 if b in MOTIFS else 0.07
        lead.add(bell(midi(n), 2.2 if b >= 18 else 1.4), t, g, pan=(0.2 if j % 2 else -0.2))
lead.x += pingpong(lead.x, 0.375, 0.32, taps=5, damp=6000)

# ---------------------------------------------------------------- sidechain
duck = np.ones(N)
for kt in kick_times:
    s = int(kt * SR)
    e = min(N, s + int(0.32 * SR))
    tt_ = np.arange(e - s) / SR
    duck[s:e] = np.minimum(duck[s:e], 1 - 0.62 * np.exp(-tt_ / 0.09))
duck = signal.sosfilt(sos_filter("low", 60, 1), duck)  # smooth attack
pad.x *= duck[:, None]
bass.x *= duck[:, None]
arp.x *= (0.35 + 0.65 * duck)[:, None]

# ---------------------------------------------------------------- mix
ir_long = make_ir(3.2, 0.03, 5200, 11)
ir_short = make_ir(1.2, 0.012, 7000, 13)

wet = reverb(pad.x * 0.55 + arp.x * 0.35 + lead.x * 0.6 + fx.x * 0.25, ir_long)
wet += reverb(drums.x * 0.12, ir_short)

mix = pad.x + arp.x + bass.x + drums.x + fx.x + lead.x + wet * 0.55
mix = filt(mix, "high", 28, 2)

# glue: gentle bus compression via soft clip, then peak limiter
mix = np.tanh(mix * 1.25) / 1.25
peak = np.max(np.abs(mix))
mix = mix / peak * 0.89

# fades
fade_in = np.minimum(1, np.arange(N) / (SR * 0.004))
fade_out = np.clip((DUR - np.arange(N) / SR) / 1.6, 0, 1) ** 1.5
mix *= (fade_in * fade_out)[:, None]

dest = Path(__file__).resolve().parents[1] / "public" / "reel-music.wav"
with wave.open(str(dest), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((np.clip(mix, -1, 1) * 32767).astype("<i2").tobytes())
rms = np.sqrt(np.mean(mix ** 2))
print(dest, f"rms={20*np.log10(rms):.1f} dBFS")
