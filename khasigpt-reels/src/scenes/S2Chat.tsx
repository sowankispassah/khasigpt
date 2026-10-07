import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {GradientText} from '../components/Brand';
import {ChatScreen} from '../components/ChatScreen';
import {Aurora, RiseWord, StatusPill, Tap} from '../components/Fx';
import {HERO_K, HeroComposer} from '../components/HeroComposer';
import {Phone} from '../components/Phone';
import {UserBubble, answerLength} from '../components/AppUI';
import {chat, copy, ui} from '../content';
import {C, clamp, DP, expoIn, expoOut, FONT, glide, kf, pop, tw, typed} from '../theme';

const CY = 930; // hero composer centre
const TYPE_AT = 50;
const FPC = 2; // frames per character
const SEND_AT = TYPE_AT + chat.question.length * FPC + 10; // 118
const FLY = SEND_AT + 6;
const PHONE_Y = 1118;
const PHONE_S = 0.58;
const STREAM_AT = 236;
const STREAM_END = 412;

/** 3–11 s · Glowing pill → composer → Khasi question → phone with streamed answer. */
export const S2Chat: React.FC = () => {
	const f = useCurrentFrame();
	const text = typed(chat.question, f, TYPE_AT, FPC);
	const total = answerLength(chat.intro, chat.sections, chat.closing);
	const count = Math.floor(interpolate(f, [STREAM_AT, STREAM_END], [0, total], clamp));

	// phone choreography
	const enter = glide(f, SEND_AT - 14, 44);
	const spin = tw(f, [440, 480], [0, 1], expoIn);
	const zoom = tw(f, [STREAM_AT - 14, STREAM_AT + 56], [0, 1], expoOut);
	const drift = tw(f, [STREAM_AT, 440], [0, 1], (t) => t);
	const phoneY = interpolate(enter, [0, 1], [2750, PHONE_Y]) + zoom * (1000 - PHONE_Y) - drift * 30;
	const phoneS = PHONE_S + zoom * (0.9 - PHONE_S) + drift * 0.03 + spin * 0.05;
	const rx = interpolate(enter, [0, 1], [34, 0]) + drift * 5;
	const ry = interpolate(enter, [0, 1], [-24, -4]) + drift * 9 + spin * 92;

	// hero composer flies into the phone dock
	const flight = tw(f, [FLY, FLY + 40], [0, 1], expoOut);
	const dockY = PHONE_Y + (1668 - 955) * PHONE_S;
	const heroOut = interpolate(f, [FLY + 30, FLY + 42], [1, 0], clamp);

	// the question bubble pops out of the composer and lands in the chat
	const bubbleT = tw(f, [SEND_AT + 2, FLY + 44], [0, 1], expoOut);
	const bubbleStart = {x: 540 - 70, y: CY - 70, s: HERO_K / DP};
	const bubbleEnd = {x: 540 + (588 - 430) * PHONE_S, y: PHONE_Y + (246 - 955) * PHONE_S, s: PHONE_S};
	const bx = interpolate(bubbleT, [0, 1], [bubbleStart.x, bubbleEnd.x]);
	const by = interpolate(bubbleT, [0, 1], [bubbleStart.y, bubbleEnd.y]) - Math.sin(bubbleT * Math.PI) * 120;
	const bs = interpolate(bubbleT, [0, 1], [bubbleStart.s, bubbleEnd.s]);
	const bubbleLanded = f >= FLY + 44;

	const phase = f < FLY + 44 ? 'sent' : f < STREAM_AT ? 'thinking' : 'answer';

	// "Dang pyrkhat" status pill floats in front, then drops into the chat
	const pillIn = pop(f, FLY + 40, 13, 160);
	const pillDrop = tw(f, [STREAM_AT - 26, STREAM_AT - 4], [0, 1], expoIn);

	const headlineExit = STREAM_AT - 16;

	return (
		<AbsoluteFill style={{background: C.bg, fontFamily: FONT, overflow: 'hidden'}}>
			{/* headline */}
			<div style={{position: 'absolute', left: 0, right: 0, top: 262, display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
				<RiseWord f={f} at={14} size={118} weight={800} exitAt={headlineExit}>
					{copy.chat[0]}
				</RiseWord>
				<RiseWord f={f} at={22} size={118} weight={800} exitAt={headlineExit}>
					<GradientText shift={interpolate(f, [20, 300], [0, 100], clamp)}>{copy.chat[1]}</GradientText>
				</RiseWord>
			</div>

			{/* phone */}
			{f >= FLY - 2 ? (
				<>
					<Aurora f={f} x={540} y={phoneY - 80} w={1500} h={1500} opacity={interpolate(f, [FLY, FLY + 40, 430, 470], [0, 0.55, 0.55, 0], clamp)} />
					<Phone x={540} y={phoneY} scale={phoneS} rx={rx} ry={ry}>
						<ChatScreen f={f} question={chat.question} answer={chat} count={count} phase={phase} bubbleOpacity={bubbleLanded ? 1 : 0} dockOpacity={interpolate(f, [FLY + 34, FLY + 42], [0, 1], clamp)} />
					</Phone>
				</>
			) : null}

			{/* hero composer */}
			{heroOut > 0 ? (
				<HeroComposer
					f={f}
					at={0}
					cy={CY}
					text={f < FLY ? text : ''}
					placeholder={ui.placeholder}
					caret={f >= TYPE_AT - 6 && f < FLY}
					sendPress={kf(f, [SEND_AT - 4, SEND_AT, SEND_AT + 8], [1, 0.82, 1])}
					flight={flight}
					target={{x: 540, y: dockY, scale: PHONE_S * (DP / HERO_K)}}
					opacity={heroOut}
				/>
			) : null}
			<Tap f={f} at={SEND_AT} x={933} y={1005} />

			{/* flying bubble */}
			{f >= SEND_AT && !bubbleLanded ? (
				<div style={{position: 'absolute', left: bx, top: by, transform: `translate(-50%, -50%) scale(${bs})`, width: 412 * DP * 0.78, opacity: interpolate(f, [SEND_AT, SEND_AT + 6], [0, 1], clamp)}}>
					<UserBubble text={chat.question} />
				</div>
			) : null}

			{/* status pill */}
			{f >= FLY + 38 && f < STREAM_AT ? (
				<div
					style={{
						position: 'absolute',
						left: 540,
						top: interpolate(pillDrop, [0, 1], [880, PHONE_Y + (330 - 955) * PHONE_S]),
						transform: `translate(-50%, -50%) scale(${pillIn * interpolate(pillDrop, [0, 1], [1, 0.35])})`,
						opacity: 1 - pillDrop,
					}}
				>
					<StatusPill f={f} text={ui.thinking} />
				</div>
			) : null}
		</AbsoluteFill>
	);
};
