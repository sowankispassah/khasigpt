import {Img,Interactive,interpolate,staticFile,useCurrentFrame} from 'remotion';
import {Brand,C,clamp,p,pop,Scene,tween} from '../design';

export const Closing: React.FC = () => {
  const frame=useCurrentFrame();
  // Keep the opening beats brisk, then play the download end card at half speed.
  const f=frame<69?frame:69+(frame-69)/2;
  return <Scene>
    {f<40&&<div style={{position:'absolute',left:80,right:80,top:490,textAlign:'center',translate:`0 ${tween(f,29,40,0,-1000)}px`}}><div style={{fontSize:60,fontWeight:600,letterSpacing:-2,opacity:p(f,0,7)}}>Pyndonkam haduh</div><div style={{display:'flex',alignItems:'baseline',justifyContent:'center',gap:27,scale:pop(f,3)}}><span style={{fontSize:370,fontWeight:800,lineHeight:1,letterSpacing:-20}}>3</span><span style={{fontSize:140,fontWeight:800,letterSpacing:-8}}>bnai</span></div><div style={{height:14,borderRadius:20,background:C.mint,width:600,margin:'35px auto 0',scale:`${pop(f,12)} 1`}}/></div>}
    {f>=32&&f<76&&<div style={{position:'absolute',left:88,right:88,top:555,fontWeight:800,fontSize:94,letterSpacing:-5,lineHeight:1.1,translate:`0 ${tween(f,65,76,0,-950)}px`}}>{['Sa bun ki','feature','kin sa wan.'].map((line,i)=><div key={line} style={{overflow:'hidden',height:120}}><div style={{translate:`0 ${tween(f,32+i*5,43+i*5,130,0)}px`,color:i===1?C.green:C.ink}}>{line}</div></div>)}</div>}
    {f>=69&&<>
      <div style={{position:'absolute',left:85,right:85,top:tween(f,85,107,760,385),display:'flex',justifyContent:'center',scale:pop(f,69)}}><Brand size={91} version/></div>
      <Interactive.Div name="Download heading" style={{position:'absolute',left:80,right:80,top:640,textAlign:'center',fontSize:52,fontWeight:600,letterSpacing:-2,opacity:interpolate(f,[102,111],[0,1],clamp),translate:`0 ${tween(f,102,116,50,0)}px`}}>Download ïa ka app na</Interactive.Div>
      <div style={{position:'absolute',left:220,right:220,top:759,height:133,display:'grid',placeItems:'center',scale:pop(f,109)}}><Img src={staticFile('google-play-logo.png')} style={{width:590,maxWidth:'100%'}}/></div>
      <div style={{position:'absolute',left:90,right:90,top:930,textAlign:'center',fontSize:42,fontWeight:600,opacity:p(f,120,129)}}>Link ha bio</div>
      <div style={{position:'absolute',left:90,right:90,top:1040,textAlign:'center',fontSize:43,color:C.muted,opacity:p(f,128,137)}}>Lane leit ha</div>
      <Interactive.Div name="Website call to action" style={{position:'absolute',left:120,right:120,top:1135,display:'flex',alignItems:'center',justifyContent:'center',fontSize:75,fontWeight:800,letterSpacing:-4,opacity:interpolate(f,[133,142],[0,1],clamp),translate:`0 ${tween(f,133,147,50,0)}px`}}>khasigpt.com</Interactive.Div>
      <div style={{position:'absolute',left:177,right:177,top:1245,height:3,background:C.line,scale:`${tween(f,144,160,0,1)} 1`,transformOrigin:'left center'}}/>
    </>}
  </Scene>;
};
