import {interpolate, useCurrentFrame} from 'remotion';
import {helpClosing, helpIntro, helpQuestion, helpSections} from '../content';
import {C, Chrome, clamp, Composer, Cursor, p, pop, PromptBubble, Scene, ScrollDocument, Thinking, tween} from '../design';

const total = helpIntro.length + helpSections.reduce((n,[a,b])=>n+a.length+b.length,0) + helpClosing.length;
const Response: React.FC<{count:number}> = ({count}) => {
  let left = count - helpIntro.length;
  return <div style={{fontSize:38, lineHeight:1.38}}><p style={{margin:'0 0 30px'}}>{helpIntro.slice(0,count)}</p>{helpSections.map(([a,b],i)=>{const title=a.slice(0,Math.max(0,left));left-=a.length;const body=b.slice(0,Math.max(0,left));left-=b.length;return title?<div key={i} style={{display:'flex',gap:18,marginBottom:27}}><span style={{color:C.green}}>•</span><div><strong style={{fontWeight:600}}>{title}</strong> {body}</div></div>:null;})}<div style={{marginTop:32,fontWeight:600}}>{helpClosing.slice(0,Math.max(0,left))}</div></div>;
};

export const Help: React.FC = () => {
  const f = useCurrentFrame();
  const count = Math.floor(p(f,65,140)*total);
  const all = <><PromptBubble text={helpQuestion}/><Response count={total}/></>;
  return <Scene>
    {f<46 && <div style={{position:'absolute',left:84,right:84,top:480,translate:`${tween(f,36,46,0,1000)}px 0`,opacity:1-p(f,39,46)}}><div style={{fontSize:83,fontWeight:800,letterSpacing:-4,lineHeight:1.08,marginBottom:65}}>Kylli da ka<br/>ktien Khasi.</div><div style={{scale:f<28?tween(f,0,24,1,1.45):tween(f,28,35,1.45,1),transformOrigin:'left top'}}><Composer text={helpQuestion.slice(0,Math.floor(p(f,3,28)*helpQuestion.length))} active={f>28}/><Cursor x={tween(f,24,34,660,807)} y={tween(f,24,34,410,220)} size={40} click={p(f,32,40)}/></div></div>}
    {f>=40 && <>
      <div style={{position:'absolute',left:84,top:155,right:70,fontSize:97,fontWeight:800,letterSpacing:-5,lineHeight:1.06,translate:`0 ${tween(f,40,55,120,0)}px`,opacity:p(f,40,50)}}>Nga lah<br/>ban iarap.</div>
      <div style={{position:'absolute',left:60,right:60,top:440,height:1320,scale:pop(f,40),translate:`0 ${tween(f,195,209,0,-1150)}px`,rotate:`${tween(f,195,209,0,-4)}deg`,opacity:1-p(f,201,210)}}><Chrome><ScrollDocument full={all} height={1235} scroll={interpolate(f,[96,122,132,156,174],[0,.2,.2,.72,1],clamp)}><PromptBubble text={helpQuestion}/>{f<65?<Thinking f={f}/>:<Response count={count}/>}</ScrollDocument></Chrome></div>
      {f>178 && <div style={{position:'absolute',left:145,right:145,bottom:110,display:'flex',justifyContent:'center',gap:14}}>{['Ka ktien','Ka coding','Ka jingthoh'].map((t,i)=><div key={t} style={{background:i===1?C.ink:'#fff',color:i===1?'#fff':C.ink,border:`1px solid ${C.line}`,boxShadow:'0 12px 30px #17202412',borderRadius:55,padding:'22px 27px',fontSize:27,fontWeight:600,scale:pop(f,178+i*5),translate:`0 ${tween(f,200,210,0,200)}px`}}>{t}</div>)}</div>}
    </>}
  </Scene>;
};
