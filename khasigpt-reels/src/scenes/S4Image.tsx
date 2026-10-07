import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {Download} from 'lucide-react';
import {GradientText} from '../components/Brand';
import {ChatScreen} from '../components/ChatScreen';
import {GeneratedImage, ImageGenerating} from '../components/FeatureUI';
import {Aurora, Flash, RiseWord, Tap} from '../components/Fx';
import {HERO_K, HeroComposer} from '../components/HeroComposer';
import {Phone} from '../components/Phone';
import {MessageActions, UserBubble} from '../components/AppUI';
import {copy, image, ui} from '../content';
import {C, clamp, DP, dp, expoIn, expoOut, FONT, glide, inOut, kf, pop, tw, typed} from '../theme';

const CY = 930;
const MODE_TAP = 50;
const TYPE_AT = 64;
const FPC = 1.3;
const SEND_AT = Math.round(TYPE_AT + image.prompt.length * FPC + 8); // ~143
const FLY = SEND_AT + 6;
const PHONE_Y = 1118;
const PHONE_S = 0.58;
const REVEAL = 240;
const BACK = 418;
const BIG = 820;
const BIG_Y = 960;

/** Canvas rect of the in-chat image card for a phone at (px, py, s). */
const cardRect = (px: number, py: number, s: number) => {
	const cx = dp(12 + 4 + 119);
	const cy = dp(92 + 74 + 119);
	return {x: px + (cx - 430) * s, y: py + (cy - 955) * s, size: dp(238) * s};
};

/** 17–25 s · Generate-image mode, prompt, progress wash, then the image bursts out of the phone. */
export const S4Image: React.FC = () => {
	const f = useCurrentFrame();
	const imageMode = f >= MODE_TAP + 2;
	const text = typed(image.prompt, f, TYPE_AT, FPC);

	// phone choreography
	const enter = glide(f, SEND_AT - 14, 44);
	const zoom = tw(f, [FLY + 44, REVEAL - 6], [0, 1], inOut);
	const out = tw(f, [BACK, 480], [0, 1], expoIn);
	// zoom target: image card near the canvas centre
	const zs = 0.95;
	const zx = 440 + (430 - dp(135)) * zs;
	const zy = 960 + (955 - dp(285)) * zs;
	const phoneX = interpolate(zoom, [0, 1], [540, zx]) - out * 1500;
	const phoneY = interpolate(enter, [0, 1], [2750, PHONE_Y]) + zoom * (zy - PHONE_Y);
	const recede = tw(f, [REVEAL, REVEAL + 40], [0, 1], expoOut) * (1 - tw(f, [BACK - 34, BACK + 4], [0, 1], inOut));
	const phoneS = PHONE_S + zoom * (zs - PHONE_S) - recede * 0.22;
	const reveal = tw(f, [REVEAL, REVEAL + 40], [0, 1], expoOut);
	const ret = tw(f, [BACK - 34, BACK + 4], [0, 1], inOut);
	const phoneDim = reveal * (1 - ret);
	const rx = interpolate(enter, [0, 1], [34, 0]) + phoneDim * 8;
	const ry = interpolate(enter, [0, 1], [-24, -4]) + zoom * 4 - out * 40;
	const progress = interpolate(f, [FLY + 44, REVEAL], [0.02, 0.9], clamp);

	const flight = tw(f, [FLY, FLY + 40], [0, 1], expoOut);
	const dockY = PHONE_Y + (1668 - 955) * PHONE_S;
	const heroOut = interpolate(f, [FLY + 30, FLY + 42], [1, 0], clamp);

	const bubbleT = tw(f, [SEND_AT + 2, FLY + 44], [0, 1], expoOut);
	const bubbleLanded = f >= FLY + 44;
	const bx = interpolate(bubbleT, [0, 1], [470, 540 + (548 - 430) * PHONE_S]);
	const by = interpolate(bubbleT, [0, 1], [CY - 70, PHONE_Y + (262 - 955) * PHONE_S]) - Math.sin(bubbleT * Math.PI) * 120;
	const bs = interpolate(bubbleT, [0, 1], [HERO_K / DP, PHONE_S]);

	// big image: from the in-chat card to centre, then back
	const from = cardRect(zx, zy, zs);
	const backTo = cardRect(zx, zy, zs);
	const bigT = reveal * (1 - ret);
	const bigX = interpolate(bigT, [0, 1], [ret > 0 ? backTo.x : from.x, 540]);
	const bigY = interpolate(bigT, [0, 1], [ret > 0 ? backTo.y : from.y, BIG_Y]);
	const bigScale = interpolate(bigT, [0, 1], [from.size / BIG, 1]);
	const resolve = interpolate(f, [REVEAL - 4, REVEAL + 46], [0.12, 1], {...clamp, easing: expoOut});
	const tilt = kf(f, [REVEAL + 20, BACK - 30], [-7, 7]);
	const shine = interpolate(f, [REVEAL + 50, REVEAL + 95], [-60, 160], clamp);

	const generated = f >= REVEAL;
	const extra = (
		<div style={{paddingLeft: dp(4)}}>
			{generated ? <GeneratedImage size={dp(238)} f={f} resolve={resolve} /> : <ImageGenerating f={f} progress={progress} />}
			{generated ? <MessageActions /> : null}
		</div>
	);

	return (
		<AbsoluteFill style={{background: C.bg, fontFamily: FONT, overflow: 'hidden'}}>
			<div style={{position: 'absolute', left: 0, right: 0, top: 262, display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
				<RiseWord f={f} at={10} size={118} weight={800} exitAt={FLY + 50}>
					{copy.image[0]}
				</RiseWord>
			</div>
			<div style={{position: 'absolute', left: 0, right: 0, top: 300, display: 'flex', justifyContent: 'center'}}>
				<RiseWord f={f} at={REVEAL + 6} size={130} weight={800} exitAt={BACK - 30}>
					<GradientText shift={interpolate(f, [REVEAL, BACK], [0, 100], clamp)}>{copy.image[1]}</GradientText>
				</RiseWord>
			</div>

			{f >= SEND_AT - 16 ? (
				<>
					<Aurora f={f} x={phoneX} y={phoneY - 100} w={1500} h={1500} opacity={interpolate(f, [FLY, FLY + 40], [0, 0.5], clamp) * (1 - out)} />
					<Phone x={phoneX} y={phoneY + recede * 160} scale={phoneS} rx={rx} ry={ry} opacity={1 - phoneDim * 0.8}>
						<ChatScreen
							f={f}
							question={image.prompt}
							phase="sent"
							bubbleOpacity={bubbleLanded ? 1 : 0}
							imageMode
							extra={bubbleLanded ? extra : null}
							extraHeight={dp(290)}
							dockOpacity={interpolate(f, [FLY + 34, FLY + 42], [0, 1], clamp)}
						/>
					</Phone>
				</>
			) : null}

			{heroOut > 0 ? (
				<HeroComposer
					f={f}
					at={0}
					cy={CY}
					text={f < FLY ? text : ''}
					placeholder={imageMode ? ui.imagePlaceholder : ui.placeholder}
					caret={f >= MODE_TAP && f < FLY}
					imageMode={imageMode}
					imagePress={kf(f, [MODE_TAP - 4, MODE_TAP, MODE_TAP + 8], [1, 0.9, 1])}
					sendPress={kf(f, [SEND_AT - 4, SEND_AT, SEND_AT + 8], [1, 0.82, 1])}
					flight={flight}
					target={{x: 540, y: dockY, scale: PHONE_S * (DP / HERO_K)}}
					opacity={heroOut}
				/>
			) : null}
			<Tap f={f} at={MODE_TAP} x={322} y={1005} />
			<Tap f={f} at={SEND_AT} x={933} y={1005} />

			{f >= SEND_AT && !bubbleLanded ? (
				<div style={{position: 'absolute', left: bx, top: by, transform: `translate(-50%, -50%) scale(${bs})`, width: 412 * DP * 0.78, opacity: interpolate(f, [SEND_AT, SEND_AT + 6], [0, 1], clamp)}}>
					<UserBubble text={image.prompt} />
				</div>
			) : null}

			{/* the generated image bursting out of the phone */}
			{f >= REVEAL && f < BACK + 6 ? (
				<div style={{position: 'absolute', left: 0, top: 0, width: 1080, height: 1920, perspective: 2200, perspectiveOrigin: `540px ${BIG_Y}px`}}>
					<div
						style={{
							position: 'absolute',
							left: bigX - BIG / 2,
							top: bigY - BIG / 2,
							width: BIG,
							height: BIG,
							transform: `scale(${bigScale}) rotateY(${tilt * bigT}deg) rotateX(${-3 * bigT}deg)`,
							borderRadius: 34,
							boxShadow: `0 ${50 * bigT}px ${120 * bigT}px rgba(31,33,83,${0.35 * bigT})`,
						}}
					>
						<GeneratedImage size={BIG} f={f} resolve={resolve} radius={34} border={false} panX={interpolate(f, [REVEAL, BACK], [-0.7, 0.7], clamp)} zoom={interpolate(f, [REVEAL, BACK], [1, 1.12], clamp)} />
						<div style={{position: 'absolute', inset: 0, borderRadius: 34, overflow: 'hidden', pointerEvents: 'none'}}>
							<div style={{position: 'absolute', top: -200, bottom: -200, width: 220, left: `${shine}%`, background: 'linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0.35), rgba(255,255,255,0))', transform: 'rotate(18deg)'}} />
						</div>
					</div>
				</div>
			) : null}

			{/* native image viewer "Download" pill */}
			<div style={{position: 'absolute', left: 540, top: 1418, transform: `translate(-50%, 0) scale(${pop(f, REVEAL + 40) * (1 - ret)})`, display: 'flex', alignItems: 'center', gap: 14, padding: '20px 40px', borderRadius: 999, background: '#fff', boxShadow: '0 16px 40px rgba(9,9,11,0.16), 0 0 0 2px #e4e4e7', fontSize: 38, fontWeight: 700, color: '#111827'}}>
				<Download size={36} strokeWidth={2.4} />
				{image.download}
			</div>

			<Flash f={f} at={REVEAL} dur={16} peak={0.85} />
		</AbsoluteFill>
	);
};
