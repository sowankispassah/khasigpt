import {Img, interpolate, staticFile, useCurrentFrame} from 'remotion';
import {products, shopIntro, shopNote, shopQuestion, shopSuggestions} from '../content';
import {C, Chrome, clamp, Composer, Icon, p, pop, PromptBubble, Scene, ScrollDocument, Thinking, tween} from '../design';

const total=shopIntro.length+shopSuggestions.reduce((n,[a,b])=>n+a.length+b.length,0)+shopNote.length;
const Results: React.FC<{count:number}> = ({count}) => {
  let left=count-shopIntro.length;
  return <div style={{fontSize:35,lineHeight:1.36}}><p style={{margin:'0 0 28px'}}>{shopIntro.slice(0,count)}</p>{shopSuggestions.map(([a,b],i)=>{const title=a.slice(0,Math.max(0,left));left-=a.length;const body=b.slice(0,Math.max(0,left));left-=b.length;return title?<div key={i} style={{marginBottom:22,paddingLeft:24,borderLeft:`3px solid ${C.mint}`}}><strong style={{fontWeight:600}}>{title}</strong> — {body}</div>:null;})}<p style={{fontSize:29,color:C.muted,marginTop:32}}>{shopNote.slice(0,Math.max(0,left))}</p></div>;
};

const ProductCard: React.FC<{i:number;f:number}> = ({i,f}) => {
  const item=products[i];
  const enter=pop(f,128+i*4);
  const scale=1.55;
  return <div style={{width:440,height:553,borderRadius:28,border:`2px solid ${C.line}`,background:'#fff',boxShadow:'0 12px 35px #1720240d',overflow:'hidden',scale:enter,translate:`${(1-enter)*(i%2===0?180:-180)}px ${(1-enter)*220}px`,rotate:`${(1-enter)*(i%2===0?-12:12)}deg`,transformOrigin:'center center'}}><div style={{position:'relative',height:325,overflow:'hidden',background:'#f6f6f6'}}><Img src={staticFile('tshirt-shopping-result.png')} style={{position:'absolute',width:1920*scale,height:1886*scale,maxWidth:'none',left:-item.x*scale,top:-item.y*scale}}/><div style={{position:'absolute',right:18,top:18,borderRadius:40,padding:'11px 16px',background:'#fff',boxShadow:'0 4px 16px #0001',fontSize:30,fontWeight:800}}>{item.price}</div></div><div style={{padding:'23px 23px'}}><div style={{fontSize:27,lineHeight:1.18,fontWeight:600,minHeight:96}}>{item.name}</div><div style={{display:'flex',justifyContent:'space-between',marginTop:18,color:C.muted,fontSize:23}}><span>{item.store}</span><span style={{color:C.ink}}>↗</span></div></div></div>;
};

export const Shopping: React.FC = () => {
  const f=useCurrentFrame();
  const full=<><PromptBubble text={shopQuestion}/><Results count={total}/></>;
  return <Scene>
    {f<49 && <div style={{position:'absolute',inset:0,translate:`0 ${tween(f,37,49,0,-650)}px`,opacity:1-p(f,42,49)}}><div style={{position:'absolute',left:82,top:350,fontSize:74,fontWeight:600,letterSpacing:-3}}>T-shirt hapoh</div><div style={{position:'absolute',left:70,top:440,fontSize:240,fontWeight:800,letterSpacing:-15,scale:pop(f,2),transformOrigin:'left center'}}>₹500<span style={{fontSize:96}}>↘</span></div><div style={{position:'absolute',left:76,right:76,top:850,scale:tween(f,0,32,.9,1.13),transformOrigin:'left top'}}><Composer text={shopQuestion.slice(0,Math.floor(p(f,5,35)*shopQuestion.length))} active={f>=35}/></div></div>}
    {f>=42 && f<137 && <div style={{position:'absolute',left:62,right:62,top:315,height:1340,scale:pop(f,42)*(1-p(f,120,137)*.15),translate:`0 ${tween(f,120,137,0,-1600)}px`,rotate:`${tween(f,120,137,0,-5)}deg`,opacity:1-p(f,125,137)}}><Chrome><ScrollDocument full={full} height={1255} scroll={p(f,93,120)}><PromptBubble text={shopQuestion}/>{f<63?<Thinking f={f}/>:<Results count={Math.floor(p(f,63,112)*total)}/>}</ScrollDocument></Chrome></div>}
    {f>=125 && <>
      <div style={{position:'absolute',left:85,top:156,right:80,fontSize:92,fontWeight:800,letterSpacing:-5,lineHeight:1.03,translate:`0 ${tween(f,125,139,90,0)}px`,opacity:p(f,125,133)}}>Ki tiar<br/>ba lah lap<span style={{color:C.green}}>.</span></div>
      <div style={{position:'absolute',right:88,top:260,width:100,height:100,borderRadius:50,background:C.mint,display:'grid',placeItems:'center',scale:pop(f,136),rotate:'-15deg'}}><Icon name="search" size={45}/></div>
      <div style={{position:'absolute',left:90,right:90,top:465,bottom:90,overflow:'hidden',maskImage:'linear-gradient(transparent,black 2%,black 97%,transparent)'}}><div style={{display:'grid',gridTemplateColumns:'440px 440px',gap:24,translate:`${tween(f,254,269,0,1200)}px -${interpolate(f,[166,188,202,228,248],[0,320,320,475,475],clamp)}px`,rotate:`${tween(f,254,269,0,8)}deg`}}>{products.map((_,i)=><ProductCard key={i} i={i} f={f}/>)}</div></div>
    </>}
  </Scene>;
};
