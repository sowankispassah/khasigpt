import './index.css';
import {Composition, Folder} from 'remotion';
import {Reel} from './Reel';
import {PromoEnhanced} from './enhanced/PromoEnhanced';
import {ENH} from './enhanced/timing';
import {S1Hook} from './scenes/S1Hook';
import {S2Chat} from './scenes/S2Chat';
import {S3Voice} from './scenes/S3Voice';
import {S4Image} from './scenes/S4Image';
import {S5Explore} from './scenes/S5Explore';
import {S6Montage} from './scenes/S6Montage';
import {S7Finale} from './scenes/S7Finale';
import {loadGeist} from './fonts';
import {FPS, HEIGHT, WIDTH} from './theme';
import {SCENES, TOTAL} from './timeline';

loadGeist();

const base = {fps: FPS, width: WIDTH, height: HEIGHT};

export const RemotionRoot: React.FC = () => (
	<>
		<Composition id="KhasiGPTReel" component={Reel} durationInFrames={TOTAL} {...base} />
		<Composition id="KhasiGPTPromoEnhanced" component={PromoEnhanced} durationInFrames={Math.round(ENH.duration * FPS)} {...base} />
		<Folder name="Scenes">
			<Composition id="S1-Hook" component={S1Hook} durationInFrames={SCENES.hook} {...base} />
			<Composition id="S2-Chat" component={S2Chat} durationInFrames={SCENES.chat} {...base} />
			<Composition id="S3-Voice" component={S3Voice} durationInFrames={SCENES.voice} {...base} />
			<Composition id="S4-Image" component={S4Image} durationInFrames={SCENES.image} {...base} />
			<Composition id="S5-Explore" component={S5Explore} durationInFrames={SCENES.explore} {...base} />
			<Composition id="S6-Montage" component={S6Montage} durationInFrames={SCENES.montage} {...base} />
			<Composition id="S7-Finale" component={S7Finale} durationInFrames={SCENES.finale} {...base} />
		</Folder>
	</>
);
