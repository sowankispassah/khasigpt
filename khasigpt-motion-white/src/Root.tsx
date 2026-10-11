import './index.css';
import {Composition,Folder,staticFile} from 'remotion';
import {loadFont} from '@remotion/fonts';
import {Promo} from './Composition';
import {Opening} from './scenes/Opening';
import {Language} from './scenes/Language';
import {Help} from './scenes/Help';
import {Shopping} from './scenes/Shopping';
import {News} from './scenes/News';
import {Pricing} from './scenes/Pricing';
import {Closing} from './scenes/Closing';

for (const weight of ['400','600','800']) {
  void loadFont({family:'Inter',url:staticFile(`fonts/Inter-${weight}.ttf`),weight});
}

export const RemotionRoot: React.FC = () => <>
  <Composition id="KhasiGPTWhiteMotion" component={Promo} durationInFrames={1863} fps={30} width={1080} height={1920}/>
  <Folder name="Scenes">
    <Composition id="Opening" component={Opening} durationInFrames={60} fps={30} width={1080} height={1920}/>
    <Composition id="Language" component={Language} durationInFrames={150} fps={30} width={1080} height={1920}/>
    <Composition id="Help" component={Help} durationInFrames={210} fps={30} width={1080} height={1920}/>
    <Composition id="Shopping" component={Shopping} durationInFrames={270} fps={30} width={1080} height={1920}/>
    <Composition id="News" component={News} durationInFrames={240} fps={30} width={1080} height={1920}/>
    <Composition id="Pricing" component={Pricing} durationInFrames={300} fps={30} width={1080} height={1920}/>
    <Composition id="Closing" component={Closing} durationInFrames={633} fps={30} width={1080} height={1920}/>
  </Folder>
</>;
