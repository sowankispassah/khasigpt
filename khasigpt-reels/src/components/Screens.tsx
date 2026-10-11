/* Static KhasiGPT screens for the montage. */
import React from 'react';
import {Download} from 'lucide-react';
import {AppHeader, answerLength, ComposerDock, Drawer, Greeting, MessageActions} from './AppUI';
import {ChatScreen} from './ChatScreen';
import {GeneratedImage, NearbyScreen, VoiceModal} from './FeatureUI';
import {chat, drawer, image, voice} from '../content';
import {DP, dp} from '../theme';

export const HomeScreen: React.FC<{text?: string}> = ({text = ''}) => (
	<>
		<AppHeader />
		<Greeting top={250} />
		<ComposerDock k={DP} text={text} sendActive={text.length > 0} />
	</>
);

export const AnswerScreen: React.FC<{f: number}> = ({f}) => (
	<ChatScreen f={f} question={chat.question} answer={chat} count={answerLength(chat.intro, chat.sections, chat.closing) * 0.55} phase="answer" />
);

export const VoiceScreen: React.FC<{f: number}> = ({f}) => (
	<>
		<ChatScreen f={f} question={voice.userSays} phase="sent" />
		<div style={{position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.34)', zIndex: 50, display: 'grid', placeItems: 'center'}}>
			<VoiceModal k={DP} f={f} status="Speaking..." level={0.8} />
		</div>
	</>
);

export const ImageChatScreen: React.FC<{f: number}> = ({f}) => (
	<ChatScreen
		f={f}
		question={image.prompt}
		phase="sent"
		imageMode
		extra={
			<div style={{paddingLeft: dp(4)}}>
				<GeneratedImage size={dp(238)} f={f} />
				<MessageActions />
			</div>
		}
		extraHeight={dp(290)}
	/>
);

export const ViewerScreen: React.FC<{f: number}> = ({f}) => (
	<div style={{position: 'absolute', inset: 0, background: '#000'}}>
		<div style={{position: 'absolute', left: 0, top: dp(250)}}>
			<GeneratedImage size={dp(412)} f={f} radius={0} border={false} />
		</div>
		<div style={{position: 'absolute', left: '50%', bottom: dp(110), transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: dp(8), padding: `${dp(10)}px ${dp(20)}px`, borderRadius: 999, background: '#fff', color: '#111827', fontSize: dp(15), fontWeight: 700}}>
			<Download size={dp(16)} strokeWidth={2.4} />
			{image.download}
		</div>
	</div>
);

export const NearbyListScreen: React.FC<{scroll: number}> = ({scroll}) => (
	<>
		<AppHeader title="Nearby" />
		<NearbyScreen scroll={scroll} />
	</>
);

export const DrawerScreen: React.FC = () => (
	<>
		<HomeScreen />
		<div style={{position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 24}} />
		<Drawer items={drawer.items} history={drawer.history} highlight={6} />
	</>
);
