import {interpolate,useCurrentFrame} from 'remotion';
import {plans} from '../content';
import {C,clamp,Icon,p,pop,Scene,tween} from '../design';

const Plan: React.FC<{i:number}> = ({i}) => {
  const plan=plans[i];
  return <div style={{height:480,position:'relative',padding:'37px 42px',border:`2px solid ${plan.recommended?'#edc76f':C.line}`,borderRadius:31,background:'#fff',boxShadow:'0 9px 25px #18202708',marginBottom:24}}>
    {plan.recommended&&<div style={{position:'absolute',top:34,right:34,padding:'9px 16px',fontSize:22,borderRadius:40,background:'#fff3d9',color:'#92651a'}}>Recommended</div>}
    <div style={{fontSize:34,fontWeight:600}}>{plan.name}</div><div style={{fontSize:93,lineHeight:1.1,letterSpacing:-5,fontWeight:800,marginTop:7}}>{plan.price}</div>
    <div style={{marginTop:28,color:i===0?C.ink:C.muted,fontSize:31,display:'flex',alignItems:'center',gap:14}}>{i===0&&<Icon name="check" size={25}/>} {plan.benefit||plan.credits}</div>
    <div style={{fontSize:29,color:C.muted,marginTop:11,height:35}}>{plan.validity}</div>
    <div style={{position:'absolute',left:42,right:42,bottom:37,height:72,display:'grid',placeItems:'center',background:i===0?'#fff':C.ink,color:i===0?C.muted:'#fff',border:i===0?`2px solid ${C.line}`:'none',borderRadius:60,fontSize:29,fontWeight:600}}>{plan.button}</div>
  </div>;
};

export const Pricing: React.FC = () => {
  const f=useCurrentFrame();
  const scroll=interpolate(f,[57,98,112,154,167,219,266],[0,320,320,700,700,1050,1050],clamp);
  return <Scene>
    <div style={{position:'absolute',left:80,right:80,top:0,translate:`0 -${scroll+tween(f,280,299,0,1600)}px`,scale:1-p(f,280,299)*.15,transformOrigin:'center top'}}>
      <div style={{position:'absolute',left:0,right:0,top:tween(f,16,37,525,138),textAlign:'center',scale:pop(f,0)}}><div style={{fontSize:91,fontWeight:800,letterSpacing:-5,lineHeight:1.04}}>Sdang khlem<br/>jingsiew<span style={{color:C.green}}>.</span></div><div style={{fontSize:43,lineHeight:1.24,color:C.muted,marginTop:28,opacity:p(f,21,30),translate:`0 ${tween(f,21,34,40,0)}px`}}>Lane recharge ha ka dor kaba biang,<br/><span style={{fontWeight:800,color:C.ink}}>tang na ₹499</span></div></div>
      <div style={{position:'absolute',top:535,left:0,right:0,opacity:p(f,25,34),translate:`0 ${tween(f,25,43,800,0)}px`}}>{plans.map((_,i)=><Plan i={i} key={i}/>)}</div>
    </div>
    <div style={{position:'absolute',left:0,right:0,bottom:0,height:120,background:'linear-gradient(transparent,white)'}}/>
  </Scene>;
};
