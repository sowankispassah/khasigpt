"""Soundtrack for the enhanced cut of "KhasiGPT Promo Video Final.mp4".

Keeps the original music (public/promo-final-audio.wav, extracted from the source
video) and layers synthesised effects on the new animation beats.
Writes public/promo-enhanced-soundtrack.wav.
"""

from pathlib import Path
import sys
import wave

import numpy as np
from scipy import signal

sys.path.insert(0, str(Path(__file__).resolve().parent))
from sfx import SR, chime, clang, lp, pop, read_wav, sparkle, swell, thud, tick, tt, whoosh  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
music = read_wav(ROOT / "public" / "promo-final-audio.wav")
CLICK = read_wav(ROOT / "public" / "click.wav")[: int(0.25 * SR)]
N = len(music)
sfx = np.zeros_like(music)


def cue(t, sound, gain):
    s = int(round(t * SR))
    if s >= N:
        return
    e = min(N, s + len(sound))
    sfx[s:e] += sound[: e - s] * gain


# opener (the original intro is quiet, so the effects carry it)
cue(0.0, whoosh(0.5, True, 0.5, -0.4, 1.3), 0.5)
cue(0.84, clang(), 0.62)
for i, t in enumerate((1.0, 1.15, 1.3)):
    cue(t, pop(520 + i * 80, 0.1), 0.22)
cue(2.12, thud(60), 0.5)
cue(2.17, sparkle(0.7, 30, 2), 0.55)
cue(3.47, pop(600), 0.3)
cue(4.15, swell(1.25), 0.55)
cue(5.43, thud(52), 0.45)

# the recording
cue(5.43, whoosh(0.5, True, 0, 0, 1.0), 0.3)
cue(6.85, whoosh(0.4, True, -0.3, 0.3, 1.3), 0.3)
cue(7.2, CLICK, 0.6)
cue(8.4, CLICK, 0.6)
cue(8.43, whoosh(0.35, True, 0.3, -0.3, 1.2), 0.25)
cue(10.2, CLICK, 0.65)
cue(10.23, whoosh(0.4, False, 0, 0, 1.0), 0.28)
cue(11.25, chime((1318.5, 1760.0, 2637.0)), 0.36)
cue(11.3, whoosh(0.45, True, 0, 0, 1.3), 0.25)
cue(12.6, whoosh(0.4, False, 0, 0, 1.0), 0.22)

# end card
cue(13.6, whoosh(0.45, True, 0.4, -0.4, 1.4), 0.4)
cue(14.2, clang(), 0.55)
cue(14.45, sparkle(0.5, 20, 9), 0.4)
cue(15.21, whoosh(0.5, True, 0, 0, 1.0), 0.25)
cue(15.86, pop(560), 0.26)
cue(16.52, pop(640), 0.3)
cue(16.85, sparkle(0.6, 26, 12), 0.45)
cue(17.17, pop(720), 0.26)
cue(17.82, pop(480, 0.1), 0.2)
cue(18.15, pop(520), 0.28)
for i in range(12):
    cue(18.3 + i * 3.5 / 60, tick(700 + i), 0.18)
cue(19.12, CLICK, 0.65)
cue(19.14, chime((1318.5, 1975.5, 2637.0)), 0.36)
cue(19.2, sparkle(0.8, 30, 14), 0.4)

# gentle room so effects sit with the music
ir_t = tt(0.5)
rng = np.random.default_rng(3)
ir = rng.normal(0, 1, (len(ir_t), 2)) * np.exp(-ir_t * 10)[:, None]
ir = lp(ir, 6000)
ir /= np.sqrt(np.sum(ir ** 2, axis=0, keepdims=True))
wet = np.stack([signal.fftconvolve(sfx[:, c], ir[:, c])[:N] for c in range(2)], axis=1)
sfx = sfx + wet * 0.15

mix = music * 0.74 + sfx * 0.9
mix = np.tanh(mix * 1.1) / np.tanh(1.1)
mix = mix / np.max(np.abs(mix)) * 0.93
out = ROOT / "public" / "promo-enhanced-soundtrack.wav"
with wave.open(str(out), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((np.clip(mix, -1, 1) * 32767).astype("<i2").tobytes())
print(out, f"{N / SR:.2f}s, rms {20 * np.log10(np.sqrt(np.mean(mix ** 2))):.1f} dBFS")
