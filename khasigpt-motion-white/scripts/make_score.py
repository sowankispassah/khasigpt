"""Original 150 BPM electronic score. Requires numpy; no third-party music samples."""
from pathlib import Path
import wave
import math
import numpy as np

rate = 24000
duration = 62.1
rng = np.random.default_rng(1403)
audio = np.zeros((round(rate * duration), 2), dtype=np.float64)
beat = .4

def add(sound, time, gain=1, pan=0):
    start = int(time * rate)
    if start >= len(audio): return
    sound = sound[:len(audio)-start] * gain
    audio[start:start+len(sound),0] += sound * np.sqrt((1-pan)/2)
    audio[start:start+len(sound),1] += sound * np.sqrt((1+pan)/2)

def tone(freq, length, kind='pluck'):
    t = np.arange(int(length*rate))/rate
    if kind == 'bass':
        osc = np.sin(2*np.pi*freq*t) + .2*np.sin(2*np.pi*freq*2*t)
        env = np.minimum(1,t/.012) * np.exp(-t*6)
    else:
        osc = np.sin(2*np.pi*freq*t) + .32*np.sin(2*np.pi*freq*2*t) + .1*np.sin(2*np.pi*freq*3*t)
        env = np.minimum(1,t/.004) * np.exp(-t*8)
    return osc*env

roots = [55,43.6535,65.4064,49]
chords = [[220,261.626,329.628],[174.614,220,261.626],[196,261.626,329.628],[196,246.942,293.665]]
for bar in range(math.ceil(duration / (beat * 4))):
    base=bar*beat*4
    notes=chords[bar%4]
    for j in range(8):
        note=notes[[0,1,2,1,0,2,1,2][j]]
        sound=tone(note*(2 if j%4==3 else 1),.6)
        amount=.09 if base<3.2 or base>=duration-4.8 else .12
        add(sound,base+j*.2,amount,(-.25 if j%2 else .25))
        add(sound,base+j*.2+.3,amount*.17,(-.45 if j%2 else .45))
    if base>=1.6:
        for k in [0,1.5,2,3.5]: add(tone(roots[bar%4],.35,'bass'),base+k*beat,.34)

for b in range(math.ceil(duration / beat)):
    time=b*beat
    if time<1.6 or time>=duration-2.4: continue
    t=np.arange(int(.27*rate))/rate
    phase=2*np.pi*(49*t+3.8*(1-np.exp(-t*28)))
    kick=np.sin(phase)*np.exp(-t*19)
    kick+=rng.normal(0,1,len(t))*np.exp(-t*170)*.075
    add(kick,time,.7)
    if b%4 in [1,3]:
        t=np.arange(int(.18*rate))/rate
        noise=rng.normal(0,1,len(t))
        noise=np.concatenate([[0],np.diff(noise)])*.4
        env=np.exp(-t*32)*(1+.2*np.sin(2*np.pi*40*t))
        add(noise*env,time,.21,.07)
    for sub in [0,.5]:
        t=np.arange(int(.07*rate))/rate
        noise=rng.normal(0,1,len(t))
        high=np.concatenate([[0],np.diff(noise)])
        add(high*np.exp(-t*90),time+sub*beat,.034 if sub==0 else .046, .35 if b%2 else -.35)

add(tone(220,1.1)+tone(261.626,1.1)+tone(329.628,1.1),duration-1.8,.16)
audio=np.tanh(audio*1.15)*.8
fade=np.minimum(1,np.arange(len(audio))/(rate*.18))*np.minimum(1,(len(audio)-np.arange(len(audio)))/(rate*1.0))
audio*=fade[:,None]
dest=Path(__file__).resolve().parents[1]/'public'/'motion-score.wav'
with wave.open(str(dest),'wb') as output:
    output.setnchannels(2)
    output.setsampwidth(2)
    output.setframerate(rate)
    output.writeframes((audio*32767).astype('<i2').tobytes())
print(dest)
