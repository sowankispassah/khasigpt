import {Audio} from '@remotion/media';
import {TransitionSeries} from '@remotion/transitions';
import {AbsoluteFill,Sequence,staticFile} from 'remotion';
import {Opening} from './scenes/Opening';
import {Language} from './scenes/Language';
import {Help} from './scenes/Help';
import {Shopping} from './scenes/Shopping';
import {News} from './scenes/News';
import {Pricing} from './scenes/Pricing';
import {Closing} from './scenes/Closing';

export const Promo: React.FC = () => <AbsoluteFill style={{background:'#fff'}}>
  <Audio src={staticFile('motion-score.wav')} volume={.78}/>
  <TransitionSeries>
    <TransitionSeries.Sequence durationInFrames={60} name="01 · Kinetic opening"><Opening/></TransitionSeries.Sequence>
    <TransitionSeries.Sequence durationInFrames={150} name="02 · Choose Khasi"><Language/></TransitionSeries.Sequence>
    <TransitionSeries.Sequence durationInFrames={210} name="03 · Ask anything"><Help/></TransitionSeries.Sequence>
    <TransitionSeries.Sequence durationInFrames={270} name="04 · Shopping results"><Shopping/></TransitionSeries.Sequence>
    <TransitionSeries.Sequence durationInFrames={240} name="05 · Shillong news"><News/></TransitionSeries.Sequence>
    <TransitionSeries.Sequence durationInFrames={300} name="06 · Plans and pricing"><Pricing/></TransitionSeries.Sequence>
    <TransitionSeries.Sequence durationInFrames={633} name="07 · Download KhasiGPT"><Closing/></TransitionSeries.Sequence>
  </TransitionSeries>
  {[52,82,196,407,542,676,914,1212,1260,1295].map((f,i)=><Sequence key={`whoosh-${i}`} from={f} durationInFrames={20} name="Camera whoosh"><Audio src={staticFile('whoosh.wav')} volume={.22} playbackRate={1.6}/></Sequence>)}
  {[100,134,243,456,742].map((f,i)=><Sequence key={`click-${i}`} from={f} durationInFrames={8} name="UI click"><Audio src={staticFile('click.wav')} volume={.5}/></Sequence>)}
  {[24,559,565,571,577,583,589,964,1479,1575].map((f,i)=><Sequence key={`pop-${i}`} from={f} durationInFrames={9} name="Card snap"><Audio src={staticFile('switch.wav')} volume={.26} playbackRate={1.3}/></Sequence>)}
</AbsoluteFill>;
