import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {GradientText} from '../components/Brand';
import {ChatScreen} from '../components/ChatScreen';
import {VoiceModal, VoiceStatus} from '../components/FeatureUI';
import {Aurora, RiseWord} from '../components/Fx';
import {Phone} from '../components/Phone';
import {answerLength} from '../components/AppUI';
import {chat, copy, voice} from '../content';
import {C, clamp, DP, expoIn, expoOut, FONT, kf, tw} from '../theme';

const PHONE_Y = 1160;
const PHONE_S = 0.6;
const BIG_K = 1.6;
const PANEL_Y = 868;
const LISTEN = [40, 150];
const THINK = [150, 184];
const SPEAK = [184, 312];

const words = (text: string) => text.split(' ');

/** Speech-like envelope: syllable bursts with short pauses between words. */
const speech = (f: number, seed: number) => {
	const syl = Math.max(0, Math.sin(f * 0.42 + seed)) ** 0.7;
	const word = 0.55 + 0.45 * Math.sin(f * 0.083 + seed * 2);
	const pause = Math.sin(f * 0.051 + seed) > 0.82 ? 0.25 : 1;
	return Math.min(1, (0.25 + syl * 0.85) * word * pause);
};

/** Siri-like ribbons in the app's palette, amplitude driven by the voice level. */
const Waves: React.FC<{f: number; level: number; y: number; opacity: number}> = ({f, level, y, opacity}) => {
	const lines = [
		{c: C.emerald, k: 1.0, p: 0, w: 12},
		{c: C.teal, k: 1.35, p: 1.7, w: 10},
		{c: C.blue, k: 0.8, p: 3.1, w: 10},
		{c: '#7cc4ec', k: 1.7, p: 4.4, w: 7},
	];
	return (
		<svg width={1080} height={900} viewBox="0 0 1080 900" style={{position: 'absolute', left: 0, top: y - 450, opacity}}>
			<defs>
				<filter id="wglow" x="-10%" y="-50%" width="120%" height="200%">
					<feGaussianBlur stdDeviation="10" />
				</filter>
				{lines.map((l, i) => (
					<linearGradient key={i} id={`wg${i}`} x1="0" x2="1" y1="0" y2="0">
						<stop offset="0" stopColor={l.c} stopOpacity="0" />
						<stop offset="0.5" stopColor={l.c} stopOpacity="1" />
						<stop offset="1" stopColor={l.c} stopOpacity="0" />
					</linearGradient>
				))}
			</defs>
			{lines.map((l, i) => {
				let d = '';
				for (let x = 0; x <= 1080; x += 8) {
					const u = (x - 540) / 540;
					const env = Math.exp(-u * u * 1.3);
					const yy = 450 + Math.sin(x * 0.011 * l.k + f * 0.16 * (1 + i * 0.2) + l.p) * env * (50 + level * 380) * (0.6 + 0.4 * Math.sin(f * 0.05 + i));
					d += `${x === 0 ? 'M' : 'L'}${x},${yy.toFixed(1)} `;
				}
				return (
					<g key={i}>
						<path d={d} fill="none" stroke={`url(#wg${i})`} strokeWidth={l.w * 3} strokeLinecap="round" opacity={0.25} filter="url(#wglow)" />
						<path d={d} fill="none" stroke={`url(#wg${i})`} strokeWidth={l.w} strokeLinecap="round" />
					</g>
				);
			})}
		</svg>
	);
};

/** 11–17 s · Voice chat lifts out of the phone; waveforms and live Khasi transcript. */
export const S3Voice: React.FC = () => {
	const f = useCurrentFrame();
	const status: VoiceStatus = f < THINK[0] ? 'Listening...' : f < SPEAK[0] ? 'Thinking...' : 'Speaking...';
	const level =
		status === 'Listening...'
			? speech(f, 0.4) * interpolate(f, [LISTEN[0], LISTEN[0] + 10, LISTEN[1] - 12, LISTEN[1]], [0.2, 1, 1, 0.15], clamp)
			: status === 'Thinking...'
				? 0.08
				: speech(f, 2.1) * interpolate(f, [SPEAK[0], SPEAK[0] + 10, SPEAK[1] - 10, SPEAK[1]], [0.2, 1, 1, 0.1], clamp);

	// phone: continues the spin from the chat scene
	const spinIn = tw(f, [0, 34], [0, 1], expoOut);
	const lift = tw(f, [26, 62], [0, 1], expoOut) * (1 - tw(f, [312, 346], [0, 1], expoOut));
	const exit = tw(f, [334, 360], [0, 1], expoIn);
	const phoneY = PHONE_Y + lift * 560 - exit * 2300;
	const phoneS = PHONE_S - lift * 0.12;
	const ry = interpolate(spinIn, [0, 1], [-92, -5]) + f * 0.02;
	const rx = 6 - lift * 2 + exit * 30;

	// floating panel: starts exactly over the in-phone panel
	const startScale = (DP * phoneS) / BIG_K;
	const panelScale = interpolate(lift, [0, 1], [startScale, 1]);
	const panelY = interpolate(lift, [0, 1], [phoneY, PANEL_Y]);

	const userWords = words(voice.userSays);
	const replyWords = words(voice.reply);
	const shownUser = Math.floor(interpolate(f, [LISTEN[0] + 12, LISTEN[1] - 14], [0, userWords.length], clamp));
	const shownReply = Math.floor(interpolate(f, [SPEAK[0] + 8, SPEAK[1] - 18], [0, replyWords.length], clamp));
	const speaking = f >= SPEAK[0];
	const captionOpacity = interpolate(f, [LISTEN[0] + 10, LISTEN[0] + 20, 316, 330], [0, 1, 1, 0], clamp);

	return (
		<AbsoluteFill style={{background: C.bg, fontFamily: FONT, overflow: 'hidden'}}>
			<Aurora f={f} x={540} y={PANEL_Y} w={1500} h={1400} opacity={0.35 + level * 0.45} speed={1.6} />
			<Waves f={f} level={level * lift} y={PANEL_Y} opacity={lift} />

			<div style={{position: 'absolute', left: 0, right: 0, top: 250, display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
				<RiseWord f={f} at={10} size={124} weight={800} exitAt={330}>
					<GradientText shift={interpolate(f, [0, 360], [0, 100], clamp)}>{copy.voice[0]}</GradientText>
				</RiseWord>
				<div style={{fontSize: 44, fontWeight: 500, color: C.mutedFg, marginTop: 10, opacity: interpolate(f, [22, 34, 326, 336], [0, 1, 1, 0], clamp), transform: `translateY(${tw(f, [22, 40], [24, 0])}px)`}}>{copy.voiceSub}</div>
			</div>

			<Phone x={540} y={phoneY} scale={phoneS} rx={rx} ry={ry} opacity={1 - lift * 0.6}>
				<ChatScreen f={f} question={chat.question} answer={chat} count={answerLength(chat.intro, chat.sections, chat.closing)} phase="answer" />
				<div style={{position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.34)', zIndex: 50, display: 'grid', placeItems: 'center'}}>
					<div style={{opacity: lift > 0.02 ? 0 : 1}}>
						<VoiceModal k={DP} f={f} status={status} level={level} />
					</div>
				</div>
			</Phone>

			{lift > 0.02 ? (
				<div style={{position: 'absolute', left: 540, top: panelY, transform: `translate(-50%, -50%) scale(${panelScale})`}}>
					<VoiceModal k={BIG_K} f={f} status={status} level={level} lift={lift} glass />
				</div>
			) : null}

			{/* live transcript */}
			<div style={{position: 'absolute', left: 84, right: 140, top: 1238, minHeight: 200, padding: '26px 36px 30px', borderRadius: 34, background: 'rgba(255,255,255,0.92)', boxShadow: '0 20px 50px rgba(9,9,11,0.12), 0 0 0 2px #e4e4e7', opacity: captionOpacity, transform: `translateY(${tw(f, [LISTEN[0] + 10, LISTEN[0] + 30], [30, 0])}px)`}}>
				<div style={{fontSize: 26, fontWeight: 600, letterSpacing: 2, color: speaking ? '#047857' : C.mutedFg, textTransform: 'uppercase', marginBottom: 8}}>{speaking ? 'KhasiGPT' : 'You'}</div>
				<div style={{fontSize: 42, lineHeight: 1.25, fontWeight: 600, color: C.ink, letterSpacing: -0.5}}>
					{(speaking ? replyWords.slice(0, shownReply) : userWords.slice(0, shownUser)).map((w, i, arr) => (
						<span key={`${speaking}-${i}`} style={{opacity: i === arr.length - 1 ? kf(f % 6, [0, 5], [0.4, 1]) : 1}}>
							{w}{' '}
						</span>
					))}
				</div>
			</div>
		</AbsoluteFill>
	);
};
