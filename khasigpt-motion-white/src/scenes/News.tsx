import {interpolate, useCurrentFrame} from 'remotion';
import {newsArticles,newsIntro,newsQuestion} from '../content';
import {C,Chrome,clamp,Composer,Icon,p,pop,PromptBubble,Scene,ScrollDocument,Thinking,tween} from '../design';

const total=newsIntro.length+newsArticles.reduce((n,a)=>n+a.title.length+a.body.length+a.date.length+a.source.length,0);
const Articles: React.FC<{count:number}> = ({count}) => {
  let left=count-newsIntro.length;
  return <div style={{fontSize:35,lineHeight:1.38}}><p style={{margin:'0 0 38px'}}>{newsIntro.slice(0,count)}</p>{newsArticles.map((a,i)=>{const title=a.title.slice(0,Math.max(0,left));left-=a.title.length;const body=a.body.slice(0,Math.max(0,left));left-=a.body.length;const date=a.date.slice(0,Math.max(0,left));left-=a.date.length;const source=a.source.slice(0,Math.max(0,left));left-=a.source.length;return title?<div key={a.url} style={{marginBottom:50}}><div style={{display:'flex',alignItems:'center',gap:14,marginBottom:18}}><div style={{height:31,width:31,borderRadius:10,background:C.mint,fontSize:19,display:'grid',placeItems:'center',fontWeight:600,flexShrink:0}}>{i+1}</div><div style={{fontWeight:800,fontSize:37,lineHeight:1.18,letterSpacing:-1}}>{title}</div></div><div>{body}</div>{date&&<div style={{marginTop:20,fontSize:26,color:C.muted}}>Tarik pynmih: {date}</div>}{source&&<div style={{marginTop:7,fontSize:26,color:C.green}}>Tyllong khubor: {source} ↗</div>}</div>:null;})}</div>;
};

export const News: React.FC = () => {
  const f=useCurrentFrame();
  const full=<><PromptBubble text={newsQuestion}/><Articles count={total}/></>;
  return <Scene>
    <div style={{position:'absolute',left:82,right:82,top:tween(f,19,38,520,153),fontSize:tween(f,19,38,154,93),fontWeight:800,letterSpacing:-6,lineHeight:1.04,translate:`${tween(f,0,14,1050,0)}px 0`,display:'flex',alignItems:'center',gap:24}}><div style={{background:C.mint,width:90,height:90,borderRadius:28,display:'grid',placeItems:'center',scale:pop(f,8)}}><Icon name="pin" size={48}/></div>Shillong.</div>
    {f>=12&&f<65&&<div style={{position:'absolute',left:80,right:80,top:810,translate:`0 ${tween(f,49,65,0,-650)}px`,opacity:1-p(f,54,65),scale:tween(f,12,38,.9,1.15),transformOrigin:'left top'}}><Composer text={newsQuestion.slice(0,Math.floor(p(f,17,49)*newsQuestion.length))} active={f>=49}/></div>}
    {f>=57&&<div style={{position:'absolute',left:60,right:60,top:365,height:1400,scale:pop(f,57),translate:`${tween(f,224,239,0,-1200)}px 0`,rotate:`${tween(f,224,239,0,-6)}deg`,opacity:1-p(f,230,240)}}><Chrome><ScrollDocument full={full} height={1315} scroll={interpolate(f,[99,131,140,173,182,211],[0,.27,.27,.67,.67,1],clamp)}><PromptBubble text={newsQuestion}/>{f<76?<Thinking f={f}/>:<Articles count={Math.floor(p(f,76,164)*total)}/>}</ScrollDocument></Chrome></div>}
    {f>86&&f<222&&<div style={{position:'absolute',right:90,top:276,padding:'15px 23px',borderRadius:40,background:C.pale,fontSize:25,color:C.muted,scale:pop(f,86)}}>The Shillong Times ↗</div>}
  </Scene>;
};
