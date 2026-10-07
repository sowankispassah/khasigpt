import React from 'react';
import {AppHeader, answerLength, ComposerDock, Greeting, MessageActions, StreamedAnswer, Thinking, UserBubble} from './AppUI';
import {useMeasuredHeight} from './useMeasure';
import {DP, dp} from '../theme';
import {ui} from '../content';

type Answer = {intro: string; sections: readonly (readonly [string, string])[]; closing?: string};

/**
 * Native chat screen inside the phone.
 * phase: 'home' (greeting), 'sent' (bubble only), 'thinking', 'answer'.
 */
export const ChatScreen: React.FC<{
	f: number;
	question?: string;
	answer?: Answer;
	count?: number;
	phase: 'home' | 'sent' | 'thinking' | 'answer';
	bubbleOpacity?: number;
	composerText?: string;
	composerCaret?: boolean;
	imageMode?: boolean;
	extra?: React.ReactNode;
	extraHeight?: number;
	dockOpacity?: number;
}> = ({f, question = '', answer, count = 0, phase, bubbleOpacity = 1, composerText = '', composerCaret = false, imageMode = false, extra, extraHeight = 0, dockOpacity = 1}) => {
	const [ref, fullH] = useMeasuredHeight(dp(600));
	const total = answer ? answerLength(answer.intro, answer.sections, answer.closing) : 1;
	const progress = Math.min(1, count / total);
	const viewport = dp(915 - 92 - 182);
	const bubbleH = dp(56);
	const contentH = bubbleH + (phase === 'answer' ? fullH * progress + dp(40) : dp(40)) + extraHeight;
	const scroll = Math.max(0, contentH - viewport + dp(16));
	return (
		<>
			<AppHeader />
			{phase === 'home' ? <Greeting top={250} /> : null}
			{answer ? (
				<div ref={ref} style={{position: 'absolute', left: dp(12), right: dp(12), top: 0, visibility: 'hidden'}}>
					<StreamedAnswer intro={answer.intro} sections={answer.sections} closing={answer.closing} count={total} />
				</div>
			) : null}
			<div style={{position: 'absolute', left: dp(12), right: dp(12), top: dp(92), bottom: dp(182), overflow: 'hidden'}}>
				<div style={{transform: `translateY(${-scroll}px)`}}>
					{phase !== 'home' ? <UserBubble text={question} style={{opacity: bubbleOpacity, marginBottom: dp(18)}} /> : null}
					{phase === 'thinking' ? <Thinking f={f} /> : null}
					{phase === 'answer' && answer ? (
						<>
							<StreamedAnswer intro={answer.intro} sections={answer.sections} closing={answer.closing} count={count} />
							{progress >= 1 ? <MessageActions /> : null}
						</>
					) : null}
					{extra}
				</div>
			</div>
			<ComposerDock k={DP} text={composerText} caretF={composerCaret ? f : null} sendActive={composerText.length > 0} imageMode={imageMode} placeholder={imageMode ? ui.imagePlaceholder : ui.placeholder} composerOpacity={dockOpacity} />
		</>
	);
};
