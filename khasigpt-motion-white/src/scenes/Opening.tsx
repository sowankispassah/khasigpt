import {Interactive, interpolate, useCurrentFrame} from 'remotion';
import {Brand, C, clamp, Icon, out, pop, Scene} from '../design';

export const Opening: React.FC = () => {
  const f = useCurrentFrame();
  return <Scene>
    <div style={{position: 'absolute', left: 86, top: 132, opacity: interpolate(f, [0, 8], [0, 1], clamp)}}><Brand size={37}/></div>
    <div style={{position: 'absolute', left: 88, top: 510, right: 70, translate: `0 ${interpolate(f, [49, 60], [0, -950], {...clamp, easing: out})}px`}}>
      <div style={{overflow: 'hidden', height: 215}}><Interactive.Div name="Opening / Kylli" style={{fontSize: 192, letterSpacing: -12, fontWeight: 800, lineHeight: 1.05, translate: `0 ${interpolate(f, [0, 10], [220, 0], {...clamp, easing: out})}px`}}>Kylli</Interactive.Div></div>
      <div style={{overflow: 'hidden', height: 110, marginTop: 14}}><div style={{fontSize: 83, letterSpacing: -4, fontWeight: 600, translate: `0 ${interpolate(f, [10, 20], [120, 0], {...clamp, easing: out})}px`}}>da ka ktien</div></div>
      <div style={{position: 'relative', marginTop: 20, height: 230}}><div style={{position: 'absolute', inset: '10px -14px 0 -22px', background: C.mint, borderRadius: 25, scale: `${pop(f, 24)} 1`, transformOrigin: 'left center', rotate: '-2deg'}}/><Interactive.Div name="Opening / Khasi" style={{position: 'relative', fontSize: 195, fontWeight: 800, lineHeight: 1.05, letterSpacing: -12, translate: `0 ${interpolate(f, [22, 33], [130, 0], {...clamp, easing: out})}px`, opacity: interpolate(f, [22, 27], [0, 1], clamp)}}>Khasi.</Interactive.Div></div>
    </div>
    <div style={{position: 'absolute', right: 105, bottom: 360, width: 125, height: 125, borderRadius: 100, background: C.ink, color: '#fff', display: 'grid', placeItems: 'center', scale: pop(f, 32), rotate: `${interpolate(f,[32,46],[-70,45],{...clamp,easing:out})}deg`}}><Icon name="arrow" size={55}/></div>
    <div style={{position: 'absolute', left: 90, bottom: 162, fontSize: 27, letterSpacing: 4, color: C.muted, opacity: interpolate(f,[25,35,51,59],[0,1,1,0],clamp)}}>KHASIGPT 1.0</div>
  </Scene>;
};
