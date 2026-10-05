import {interpolate, useCurrentFrame} from 'remotion';
import {Brand, C, clamp, Composer, Cursor, Icon, pop, Scene, tween} from '../design';

export const Language: React.FC = () => {
  const f = useCurrentFrame();
  const khasi = f >= 76;
  const zoom = f < 82 ? tween(f, 20, 40, 1, 2.05) : tween(f, 82, 106, 2.05, 1);
  const cameraY = f < 82 ? tween(f, 20, 40, 0, -480) : tween(f, 82, 106, -480, 0);
  return <Scene>
    <div style={{position: 'absolute', top: 156, left: 84, right: 84, fontSize: 83, fontWeight: 800, letterSpacing: -4, lineHeight: 1.07, opacity: interpolate(f,[0,10,24,33,110,120],[0,1,1,0,0,1],clamp)}}>{khasi ? <>Ha ka ktien<br/>jong phi.</> : <>Ka ktien<br/>jong phi.</>}</div>
    <div style={{position: 'absolute', left: 74, top: 430, width: 932, height: 1220, perspective: 1800, translate: `${tween(f,136,149,0,-1350)}px ${cameraY+tween(f,0,18,450,0)}px`, scale: zoom * tween(f,0,18,.82,1), transformOrigin: '280px 810px', transform: `rotateY(${tween(f,0,22,-12,0)}deg) rotateZ(${tween(f,0,22,4,0)}deg)`, opacity: interpolate(f,[0,7],[0,1],clamp)}}>
      <div style={{height:'100%', background:'#fff', border:`2px solid ${C.line}`, borderRadius:40, boxShadow:'0 35px 100px #16202a16', position:'relative'}}>
        <div style={{position:'absolute', left:42, top:48}}><Brand size={29}/></div>
        <div style={{position:'absolute', left:50, right:50, top:275, textAlign:'center', fontSize:66, fontWeight:800, letterSpacing:-3}}>Hi, Khraw!</div>
        <div key={String(khasi)} style={{position:'absolute', left:90, right:90, top:374, textAlign:'center', fontSize:40, lineHeight:1.3, color:C.muted, opacity: khasi ? interpolate(f,[76,82],[0,1],clamp):1, translate: khasi ? `0 ${tween(f,76,90,24,0)}px`:'0 0'}}>{khasi ? 'Kaei nga lah ban iarap ïa phi mynta?' : 'How can I help you today?'}</div>
        <div style={{position:'absolute', left:40, right:40, top:600}}><Composer text="" khasi={khasi}/></div>
        {f >= 43 && f < 83 && <div style={{position:'absolute', left:142, top:880, width:330, padding:12, borderRadius:24, border:`1px solid ${C.line}`, background:'#fff', boxShadow:'0 15px 35px #18212724', scale:pop(f,43), transformOrigin:'top left', fontSize:31}}><div style={{padding:'21px 24px', color:C.muted}}>English</div><div style={{padding:'21px 24px', borderRadius:15, background:f>=69?C.mint:C.pale, display:'flex', alignItems:'center', justifyContent:'space-between'}}>Khasi{f>=69 && <Icon name="check" size={28}/>}</div></div>}
        {f >= 28 && f < 89 && <Cursor x={f<49?tween(f,28,40,500,230):tween(f,49,64,230,260)} y={f<49?tween(f,28,40,930,812):tween(f,49,64,812,1014)} size={33} click={f<48?interpolate(f,[39,43,48],[0,1,0],clamp):interpolate(f,[70,75,82],[0,1,0],clamp)}/>}
      </div>
    </div>
    {f>=108 && <div style={{position:'absolute', top:1560, right:92, padding:'22px 30px', borderRadius:60, display:'flex', alignItems:'center', gap:18, background:C.ink, color:'#fff', fontSize:32, boxShadow:'0 15px 35px #0002', scale:pop(f,108), translate:`${tween(f,136,149,0,-1350)}px 0`}}><Icon name="check" size={27}/>Khasi</div>}
  </Scene>;
};
